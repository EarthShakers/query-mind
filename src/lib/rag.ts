import { supabase } from "./supabase";
import type { UploadProgress } from "./parsers";

export interface DocResult {
  title: string;
  content: string;
  similarity: number;
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

  return (data ?? []).map(
    (row: { title: string; content: string; similarity: number }) => ({
      title: row.title,
      content: row.content,
      similarity: row.similarity,
    })
  );
}

/**
 * 将文档切片后写入向量库
 */
export async function ingestDocument(
  title: string,
  content: string,
  metadata: Record<string, unknown> = {},
  spaceId?: string,
  tenantId?: string,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal
): Promise<number> {
  const chunks = splitMarkdown(content);

  onProgress?.({ stage: "chunking", total: chunks.length });

  const rows = [];

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error("上传已取消");

    const chunk = chunks[i];
    // 向量化使用纯文本标题上下文，提升召回准确率
    const embeddingPrefix = chunk.headers.length
      ? chunk.headers.join(" > ") + "\n\n"
      : "";
    const textForEmbedding = embeddingPrefix + chunk.content;
    // 存储内容使用 Markdown 粗体标题，兼顾预览可读性
    const displayPrefix = chunk.headers.length
      ? `**${chunk.headers.join(" > ")}**\n\n`
      : "";

    const embedding = await embed(textForEmbedding);

    onProgress?.({ stage: "embedding", current: i + 1, total: chunks.length });

    rows.push({
      title,
      content: displayPrefix + chunk.content,
      embedding,
      metadata: {
        ...metadata,
        ...(chunk.headers.length ? { section: chunk.headers.join(" > ") } : {}),
      },
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

/* ─── Markdown Header Splitting ─── */

interface ChunkWithHeaders {
  content: string;
  headers: string[]; // 标题层级，如 ["三、激励内容", "(一) 直销激励"]
}

const HEADER_RE = /^(#{1,4})\s+(.+)$/;
const MAX_CHUNK_LEN = 800;
const CHUNK_OVERLAP = 100;

/**
 * 按 Markdown 标题切分文档
 * 1. 按 # ## ### #### 切出语义段落，每段携带标题层级上下文
 * 2. 超长段落按句子/段落递归切分，保留 overlap
 */
function splitMarkdown(text: string): ChunkWithHeaders[] {
  const lines = text.split("\n");
  const sections: ChunkWithHeaders[] = [];

  // 当前标题层级栈：index 0 = h1, 1 = h2, ...
  const headerStack: string[] = [];
  let currentContent = "";

  function flushSection() {
    const trimmed = currentContent.trim();
    if (!trimmed) return;

    const headers = headerStack.filter(Boolean);

    // 如果内容在限制内，直接作为一个 chunk
    if (trimmed.length <= MAX_CHUNK_LEN) {
      sections.push({ content: trimmed, headers: [...headers] });
    } else {
      // 超长段落：按段落/句子递归切分
      const subChunks = recursiveSplit(trimmed, MAX_CHUNK_LEN, CHUNK_OVERLAP);
      for (const sub of subChunks) {
        sections.push({ content: sub, headers: [...headers] });
      }
    }

    currentContent = "";
  }

  for (const line of lines) {
    const match = line.match(HEADER_RE);
    if (match) {
      // 遇到新标题，先把之前累积的内容存起来
      flushSection();

      const level = match[1].length; // 1-4
      const title = match[2].trim();

      // 更新标题栈：设置当前层级，清除更低层级
      headerStack[level - 1] = title;
      for (let i = level; i < headerStack.length; i++) {
        headerStack[i] = "";
      }
    } else {
      currentContent += (currentContent ? "\n" : "") + line;
    }
  }

  // 最后一段
  flushSection();

  // 如果整个文档没有标题（纯文本），回退到按段落切
  if (sections.length === 0 && text.trim()) {
    const subChunks = recursiveSplit(text.trim(), MAX_CHUNK_LEN, CHUNK_OVERLAP);
    return subChunks.map((c) => ({ content: c, headers: [] }));
  }

  return sections;
}

/**
 * 递归切分超长文本
 * 优先按段落切 → 按句子切 → 硬切
 */
function recursiveSplit(
  text: string,
  maxLen: number,
  overlap: number
): string[] {
  if (text.length <= maxLen) return [text];

  // 分隔符优先级：段落 > 换行 > 中文句号 > 其他句末标点 > 空格
  const separators = ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " "];

  for (const sep of separators) {
    const parts = text.split(sep);
    if (parts.length <= 1) continue;

    const chunks: string[] = [];
    let current = "";

    for (const part of parts) {
      const candidate = current ? current + sep + part : part;

      if (candidate.length > maxLen && current) {
        chunks.push(current.trim());
        // overlap：保留上一段末尾
        const tail = current.slice(-overlap);
        current = tail + sep + part;
      } else {
        current = candidate;
      }
    }
    if (current.trim()) {
      chunks.push(current.trim());
    }

    if (chunks.length > 1) return chunks;
  }

  // 所有分隔符都切不动，硬切
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen - overlap) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}
