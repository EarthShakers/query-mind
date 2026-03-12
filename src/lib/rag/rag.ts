import { supabase } from "../supabase";
import { embed } from "./embed";
import { generateChunkSummary } from "./summary";
import {
  getChunks,
  type ChunkStrategy,
  type ParentChildOptions,
} from "./chunking";
import { parseSelfQuery } from "./self-query";

export { embed } from "./embed";
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

/** 元数据过滤条件（用于 Self-Query） */
export interface SearchFilter {
  /** 按文档标题模糊匹配 */
  filterTitle?: string;
}

/**
 * 向量相似度搜索，返回最相关的文档片段（支持 spaceIds、filterTitle 过滤）
 */
export async function searchDocuments(
  query: string,
  topK = 5,
  spaceIds?: string[],
  filter?: SearchFilter
): Promise<DocResult[]> {
  const queryEmbedding = await embed(query);

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: topK,
    filter_spaces: spaceIds?.length ? spaceIds : null,
    filter_title: filter?.filterTitle?.trim() || null,
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
 * Self-Query 检索：从用户问题解析 query + filter，再执行向量检索
 * 若带 filter 无结果，则自动回退为无 filter 检索，避免误过滤
 */
export async function searchWithSelfQuery(
  userMessage: string,
  topK = 5,
  spaceIds?: string[]
): Promise<DocResult[]> {
  const { query, filterTitle } = await parseSelfQuery(userMessage);
  // debug: 服务端日志，便于排查 Self-Query 解析
  console.log("[Self-Query] input:", userMessage, "| parsed:", { query, filterTitle });

  if (!query.trim()) return [];

  const filter: SearchFilter | undefined =
    filterTitle ? { filterTitle } : undefined;

  const results = await searchDocuments(query, topK, spaceIds, filter);
  // 带 filter 无结果时，回退为无 filter 检索（避免误解析导致漏检）
  if (filter && results.length === 0) {
    console.log("[Self-Query] filter 无结果，回退为无 filter 检索");
    return searchDocuments(query, topK, spaceIds);
  }
  return results;
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

