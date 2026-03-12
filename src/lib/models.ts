/**
 * 模型配置集中管理
 * 修改模型只需改这一个文件
 */

/** 主对话模型（Chat、Report 生成） */
export const MODEL_CHAT = process.env.MODEL_CHAT || "deepseek-v3.1";

/** 轻量任务模型（Self-Query 解析、Multi-Query 改写、摘要生成、标题生成） */
export const MODEL_LIGHT = process.env.MODEL_LIGHT || "qwen-turbo";

/** LangGraph Agent 模型 */
export const MODEL_AGENT = process.env.MODEL_AGENT || "deepseek-v3.1";

/** Rerank 模型 */
export const MODEL_RERANK = process.env.MODEL_RERANK || "qwen3-rerank";

/** Embedding 模型 */
export const MODEL_EMBEDDING =
  process.env.MODEL_EMBEDDING || "text-embedding-v4";

/** Embedding 维度 */
export const EMBEDDING_DIMENSIONS = parseInt(
  process.env.EMBEDDING_DIMENSIONS || "1024",
  10
);
