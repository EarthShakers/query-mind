import { supabase } from "./supabase";
import { generateChunkSummary } from "./summary";
import {
  getChunks,
  type ChunkStrategy,
  type ParentChildOptions,
} from "./chunking";

export type { ParentChildOptions };
import type { UploadProgress } from "./parsers";

export type { ChunkStrategy };

const ENABLE_SUMMARY_INDEX =
  process.env.ENABLE_SUMMARY_INDEX === "true" || process.env.ENABLE_SUMMARY_INDEX === "1";

export interface DocResult {
  title: string;
  content: string;
  similarity: number;
  /** 摘要索引生成的 chunk 摘要，有则展示 */
  summary?: string;
}

interface EmbeddingProviderError {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
  request_id?: string;
  id?: string;
}

function formatEmbeddingApiError(status: number, rawBody: string): string {
  let parsed: EmbeddingProviderError | null = null;
  try {
    parsed = JSON.parse(rawBody) as EmbeddingProviderError;
  } catch {
    // Non-JSON payload, keep fallback message below.
  }

  const code = parsed?.error?.code ?? parsed?.error?.type ?? "";
  const providerMessage = parsed?.error?.message?.trim() ?? "";
  const requestId = parsed?.request_id ?? parsed?.id ?? "";

  if (code === "Arrearage") {
    return [
      "Embedding 服务不可用：DashScope 账户处于欠费状态，请先完成充值或恢复账户可用状态。",
      requestId ? `request_id: ${requestId}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (status === 401 || code === "InvalidApiKey") {
    return "Embedding 服务鉴权失败，请检查 DASHSCOPE_API_KEY 是否正确且仍有效。";
  }

  if (status === 429 || code === "Throttling") {
    return "Embedding 服务限流，请稍后重试，或降低并发上传。";
  }

  return [
    `Embedding API error (${status})`,
    providerMessage || rawBody.slice(0, 300),
    requestId ? `request_id: ${requestId}` : "",
  ]
    .filter(Boolean)
    .join(": ");
}

/**
 * 调用百炼 text-embedding-v4 生成向量
 */
export async function embed(text: string): Promise<number[]> {
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error("缺少 DASHSCOPE_API_KEY，无法执行向量化。");
  }

  const res = await fetch(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-v4",
        input: text,
        dimensions: 1024,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(formatEmbeddingApiError(res.status, err));
  }

  const json = await res.json();
  return json.data[0].embedding;
}

/**
 * 向量相似度搜索，返回最相关的文档片段（按 spaceIds 过滤）
 */
export async function searchDocuments(
  query: string,
  topK = 5,
  spaceIds?: string[]
): Promise<DocResult[]> {
  const queryEmbedding = await embed(query);

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: topK,
    filter_spaces: spaceIds?.length ? spaceIds : null,
  });

  if (error) throw new Error(`Vector search error: ${error.message}`);

  const rows = (data ?? []) as {
    id: number;
    title: string;
    content: string;
    similarity: number;
  }[];

  if (rows.length === 0) return [];

  const { data: metaRows } = await supabase
    .from("documents")
    .select("id, metadata")
    .in("id", rows.map((r) => r.id));

  const metaMap = new Map<number, Record<string, unknown>>();
  for (const r of metaRows ?? []) {
    metaMap.set(r.id, (r.metadata as Record<string, unknown>) ?? {});
  }

  const results = rows.map((row) => {
    const meta = metaMap.get(row.id);
    const summary = typeof meta?.summary === "string" ? meta.summary : undefined;
    const parentId = meta?.parent_id as string | undefined;
    return {
      title: row.title,
      content: row.content,
      similarity: row.similarity,
      ...(summary ? { summary } : {}),
      ...(parentId ? { parentId } : {}),
    };
  });

  if (results.some((r) => r.parentId)) {
    const sorted = [...results].sort((a, b) => b.similarity - a.similarity);
    const seen = new Set<string>();
    return sorted
      .filter((r) => {
        const key = r.parentId ?? `single-${r.content.slice(0, 50)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ parentId: _, ...r }) => r);
  }
  return results.map(({ parentId: _, ...r }) => r);
}

/**
 * 将文档切片后写入向量库
 * @param chunkStrategy 切分策略：standard | parentChild | semantic
 * @param chunkOptions 切分参数：standard/语义 用父块参数；parentChild 用父块+子块参数
 */
export async function ingestDocument(
  title: string,
  content: string,
  metadata: Record<string, unknown> = {},
  spaceId?: string,
  tenantId?: string,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
  chunkStrategy: ChunkStrategy = "standard",
  chunkOptions?: ParentChildOptions
): Promise<number> {
  const chunksResolved = await getChunks(
    chunkStrategy,
    content,
    chunkStrategy === "semantic" ? embed : undefined,
    chunkOptions
  );

  onProgress?.({ stage: "chunking", total: chunksResolved.length });

  const rows = [];

  for (let i = 0; i < chunksResolved.length; i++) {
    if (signal?.aborted) throw new Error("上传已取消");

    const chunk = chunksResolved[i];
    const embeddingPrefix = chunk.headers.length
      ? chunk.headers.join(" > ") + "\n\n"
      : "";
    const displayPrefix = chunk.headers.length
      ? `**${chunk.headers.join(" > ")}**\n\n`
      : "";

    const isParentChild = "parentContent" in chunk && chunk.parentContent;
    const contentToEmbed = chunk.content;
    const contentToStore = isParentChild
      ? chunk.parentContent!
      : displayPrefix + chunk.content;

    let textForEmbedding: string;
    let chunkMeta: Record<string, unknown> = {
      ...metadata,
      ...(chunk.headers.length ? { section: chunk.headers.join(" > ") } : {}),
      ...(chunk.parentId ? { parent_id: chunk.parentId } : {}),
    };

    if (ENABLE_SUMMARY_INDEX) {
      onProgress?.({ stage: "summarizing", current: i + 1, total: chunksResolved.length });
      const summary = await generateChunkSummary(contentToEmbed);
      textForEmbedding = embeddingPrefix + (summary || contentToEmbed);
      chunkMeta = { ...chunkMeta, summary: summary || undefined };
    } else {
      textForEmbedding = embeddingPrefix + contentToEmbed;
    }

    const embedding = await embed(textForEmbedding);

    onProgress?.({ stage: "embedding", current: i + 1, total: chunksResolved.length });

    rows.push({
      title,
      content: contentToStore,
      embedding,
      metadata: chunkMeta,
      ...(tenantId ? { tenant_id: tenantId } : {}),
      ...(spaceId ? { space_id: spaceId } : {}),
    });
  }

  if (signal?.aborted) throw new Error("上传已取消");

  onProgress?.({ stage: "storing" });

  const { error } = await supabase.from("documents").insert(rows);
  if (error) throw new Error(`Ingest error: ${error.message}`);

  return rows.length;
}

