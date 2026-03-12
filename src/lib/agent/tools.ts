/**
 * Agent 工具函数：包装现有 RAG、SQL 逻辑供 agent graph 调用
 */
import { queryUserData } from "@/lib/data/pg";
import { searchWithRagEnhanced } from "@/lib/rag/rag-enhanced";

export interface SearchKnowledgeResult {
  query: string;
  results: Array<{
    content: string;
    similarity: number;
    metadata?: Record<string, unknown>;
  }>;
  error?: string;
}

export async function agentSearchKnowledge(
  query: string,
  spaceIds: string[],
  userMessage?: string
): Promise<SearchKnowledgeResult> {
  try {
    const ragResult = await searchWithRagEnhanced(
      userMessage || query,
      spaceIds
    );
    return {
      query,
      results: ragResult.map((r) => ({
        content: r.content,
        similarity: r.similarity,
        metadata: { title: r.title, summary: r.summary },
      })),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { query, results: [], error: msg };
  }
}

export interface ExecuteQueryResult {
  sql: string;
  data: Record<string, unknown>[];
  error?: string;
}

export async function agentExecuteQuery(
  sql: string
): Promise<ExecuteQueryResult> {
  try {
    const data = await queryUserData(sql);
    return { sql, data };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sql, data: [], error: msg };
  }
}
