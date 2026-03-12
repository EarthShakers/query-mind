/**
 * 向量化：调用百炼 text-embedding-v4
 * 独立模块，供 RAG 检索与评估脚本共用，避免评估脚本依赖 Supabase
 */

import { MODEL_EMBEDDING, EMBEDDING_DIMENSIONS } from "./models";

interface EmbeddingProviderError {
  error?: { message?: string; type?: string; code?: string };
  request_id?: string;
  id?: string;
}

function formatEmbeddingApiError(status: number, rawBody: string): string {
  let parsed: EmbeddingProviderError | null = null;
  try {
    parsed = JSON.parse(rawBody) as EmbeddingProviderError;
  } catch {
    // non-JSON
  }
  const code = parsed?.error?.code ?? parsed?.error?.type ?? "";
  const providerMessage = parsed?.error?.message?.trim() ?? "";
  const requestId = parsed?.request_id ?? parsed?.id ?? "";

  if (code === "Arrearage") {
    return [
      "Embedding 服务不可用：DashScope 账户处于欠费状态。",
      requestId ? `request_id: ${requestId}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (status === 401 || code === "InvalidApiKey") {
    return "Embedding 服务鉴权失败，请检查 DASHSCOPE_API_KEY。";
  }
  if (status === 429 || code === "Throttling") {
    return "Embedding 服务限流，请稍后重试。";
  }
  return [
    `Embedding API error (${status})`,
    providerMessage || rawBody.slice(0, 300),
    requestId ? `request_id: ${requestId}` : "",
  ]
    .filter(Boolean)
    .join(": ");
}

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
        model: MODEL_EMBEDDING,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
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
