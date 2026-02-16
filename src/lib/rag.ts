import { supabase } from "./supabase";

export interface DocResult {
  title: string;
  content: string;
  similarity: number;
}

/**
 * 调用百炼 text-embedding-v3 生成向量
 */
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-v3",
        input: text,
        dimensions: 1024,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error: ${err}`);
  }

  const json = await res.json();
  return json.data[0].embedding;
}

/**
 * 向量相似度搜索，返回最相关的文档片段
 */
export async function searchDocuments(
  query: string,
  topK = 5
): Promise<DocResult[]> {
  const queryEmbedding = await embed(query);

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: topK,
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
  metadata: Record<string, unknown> = {}
): Promise<number> {
  const chunks = splitChunks(content, 500);
  const rows = [];

  for (const chunk of chunks) {
    const embedding = await embed(chunk);
    rows.push({
      title,
      content: chunk,
      embedding,
      metadata,
    });
  }

  const { error } = await supabase.from("documents").insert(rows);
  if (error) throw new Error(`Ingest error: ${error.message}`);

  return rows.length;
}

/**
 * 按段落 + 字数上限切片
 */
function splitChunks(text: string, maxLen: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 1 > maxLen && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + trimmed;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length ? chunks : [text.trim()];
}
