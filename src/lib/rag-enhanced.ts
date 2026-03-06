/**
 * RAG 增强检索：基于置信度的自适应策略
 * 1. 先检索 top-20
 * 2. 计算置信度（score_gap、score_std、score[0] 阈值）
 * 3. 高置信度 → 直接用 top-10
 * 4. 低置信度 → Rerank 或 Multi-Query
 */
import { RunnableSequence, RunnableBranch } from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { searchDocuments, type DocResult, type SearchFilter } from "./rag";
import { parseSelfQuery } from "./self-query";
import { getDashScopeLLM } from "./llm";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

const TOP_K_INITIAL = 20;
const TOP_K_FINAL = 10;

function parseThreshold(env: string | undefined, fallback: number): number {
  const val = parseFloat(env ?? String(fallback));
  return Number.isFinite(val) ? val : fallback;
}

/** 置信度阈值（可配置） */
const SCORE_GAP_THRESHOLD = parseThreshold(
  process.env.RAG_SCORE_GAP_THRESHOLD,
  0.08
);
const SCORE_STD_THRESHOLD = parseThreshold(
  process.env.RAG_SCORE_STD_THRESHOLD,
  0.12
);
const SCORE_TOP1_MIN_HIGH = parseThreshold(
  process.env.RAG_SCORE_TOP1_MIN_HIGH,
  0.55
);
const SCORE_TOP1_MIN_RERANK = parseThreshold(
  process.env.RAG_SCORE_TOP1_MIN_RERANK,
  0.4
);

export interface RagEnhancedState {
  userMessage: string;
  spaceIds: string[];
  query: string;
  filter?: SearchFilter;
  results: DocResult[];
  scores: number[];
  confidence: "high" | "low";
  action: "top10" | "rerank" | "multi_query";
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance =
    arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * 计算检索置信度
 * - score_gap 大 + score_std 小 + score[0] 高 → 高置信度
 * - 否则 → 低置信度，并根据 score[0] 决定 rerank 或 multi_query
 */
function computeConfidence(results: DocResult[]): {
  confidence: "high" | "low";
  action: "top10" | "rerank" | "multi_query";
  scoreGap: number;
  scoreStd: number;
} {
  const scores = results.map((r) => r.similarity);

  if (results.length < 2) {
    const top1 = scores[0] ?? 0;
    return {
      confidence: "low",
      action: top1 >= SCORE_TOP1_MIN_RERANK ? "rerank" : "multi_query",
      scoreGap: 0,
      scoreStd: 0,
    };
  }

  const scoreGap = scores[0] - scores[1];
  const scoreStd = std(scores);
  const top1 = scores[0];

  // 最高分太低，直接低置信
  if (top1 < SCORE_TOP1_MIN_HIGH) {
    return {
      confidence: "low",
      action: top1 >= SCORE_TOP1_MIN_RERANK ? "rerank" : "multi_query",
      scoreGap,
      scoreStd,
    };
  }

  const gapOk = scoreGap >= SCORE_GAP_THRESHOLD;
  const stdOk = scoreStd <= SCORE_STD_THRESHOLD;

  if (gapOk && stdOk) {
    return {
      confidence: "high",
      action: "top10",
      scoreGap,
      scoreStd,
    };
  }

  return {
    confidence: "low",
    action: top1 >= SCORE_TOP1_MIN_RERANK ? "rerank" : "multi_query",
    scoreGap,
    scoreStd,
  };
}

/** DocResult → LangChain Document */
function toLangChainDoc(d: DocResult): Document {
  return new Document({
    pageContent: `${d.title}\n\n${d.content}`,
    metadata: { title: d.title, similarity: d.similarity, summary: d.summary },
  });
}

/** LangChain Document → DocResult（保留 similarity） */
function fromLangChainDoc(
  doc: Document,
  originalResults: DocResult[]
): DocResult {
  const meta = doc.metadata as Record<string, unknown>;
  const title = (meta?.title as string) || "";
  // 去掉 "title\n\n" 前缀
  const content = doc.pageContent.replace(/^[^\n]*\n\n?/, "");
  const orig = originalResults.find(
    (r) =>
      r.title === title && r.content.slice(0, 80) === content.slice(0, 80)
  );
  return {
    title,
    content,
    similarity: (orig?.similarity ?? (meta?.similarity as number)) ?? 0,
    ...(meta?.summary ? { summary: meta.summary as string } : {}),
  };
}

/** Rerank：使用 Cohere（若配置）或保持原序 */
async function rerankDocs(
  query: string,
  docs: DocResult[]
): Promise<DocResult[]> {
  const hasCohere = !!process.env.COHERE_API_KEY;
  if (!hasCohere || docs.length === 0) {
    return docs.slice(0, TOP_K_FINAL);
  }

  try {
    const { CohereRerank } = await import("@langchain/cohere");
    const reranker = new CohereRerank({
      model: "rerank-multilingual-v3.0",
      topN: TOP_K_FINAL,
    });
    const lcDocs = docs.map(toLangChainDoc);
    const reranked = await reranker.compressDocuments(lcDocs, query);
    return reranked.map((d) => fromLangChainDoc(d, docs));
  } catch (e) {
    console.warn("[RAG-Enhanced] Cohere rerank failed, fallback to top-K:", e);
    return docs.slice(0, TOP_K_FINAL);
  }
}

const MultiQuerySchema = z.object({
  queries: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe("2-4 个语义相近但表述不同的检索 query"),
});

/** Multi-Query：生成多个 query 变体，分别检索后合并去重 */
async function multiQueryRetrieve(
  query: string,
  spaceIds: string[],
  filter?: SearchFilter
): Promise<DocResult[]> {
  const llm = getDashScopeLLM({ model: "qwen-turbo", maxTokens: 200 });
  const structuredLlm = llm.withStructuredOutput(MultiQuerySchema);
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一个检索 query 改写助手。根据用户问题生成 2-4 个语义相近但表述不同的检索 query，用于向量检索。
要求：保留核心语义，可换同义词、换句式、补充隐含信息。每个 query 一行，简洁。`,
    ],
    ["human", "用户问题：{query}"],
  ]);

  let queries: string[];
  try {
    const result = (await prompt.pipe(structuredLlm).invoke({ query })) as z.infer<
      typeof MultiQuerySchema
    >;
    queries = result?.queries?.filter((q) => q?.trim()) || [query];
    if (queries.length === 0) queries = [query];
  } catch {
    queries = [query];
  }

  const seen = new Set<string>();
  const merged: DocResult[] = [];
  // 用 title+content 全文去重，避免不同 chunk 因前 100 字相同被误合并
  const contentKey = (d: DocResult) => `${d.title}\0${d.content}`;

  for (const q of queries) {
    let batch = await searchDocuments(q, TOP_K_INITIAL, spaceIds, filter);
    // 与 searchWithSelfQuery 一致：filter 无结果时回退为无 filter
    if (filter && batch.length === 0) {
      batch = await searchDocuments(q, TOP_K_INITIAL, spaceIds);
    }
    for (const r of batch) {
      const key = contentKey(r);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(r);
      }
    }
  }

  // 按 similarity 排序，取 top-K
  merged.sort((a, b) => b.similarity - a.similarity);
  return merged.slice(0, TOP_K_FINAL);
}

/** 构建 RAG 增强检索链 */
function buildRagEnhancedChain() {
  const retrieveAndParse = async (input: {
    userMessage: string;
    spaceIds: string[];
  }): Promise<RagEnhancedState> => {
    const { userMessage, spaceIds } = input;
    const { query, filterTitle } = await parseSelfQuery(userMessage);
    if (!query.trim()) {
      return {
        ...input,
        query: userMessage,
        results: [],
        scores: [],
        confidence: "low",
        action: "multi_query",
      };
    }

    const filter: SearchFilter | undefined = filterTitle
      ? { filterTitle }
      : undefined;
    let results = await searchDocuments(
      query,
      TOP_K_INITIAL,
      spaceIds,
      filter
    );
    if (filter && results.length === 0) {
      results = await searchDocuments(query, TOP_K_INITIAL, spaceIds);
    }

    const scores = results.map((r) => r.similarity);
    const { confidence, action } = computeConfidence(results);

    console.log("[RAG-Enhanced]", {
      query,
      resultsCount: results.length,
      confidence,
      action,
      scoreGap: scores.length >= 2 ? scores[0] - scores[1] : 0,
      scoreStd: std(scores),
    });

    return {
      userMessage,
      spaceIds,
      query,
      filter,
      results,
      scores,
      confidence,
      action,
    };
  };

  const useTop10 = (state: RagEnhancedState): DocResult[] =>
    state.results.slice(0, TOP_K_FINAL);

  const doRerank = async (state: RagEnhancedState): Promise<DocResult[]> =>
    rerankDocs(state.query, state.results);

  const doMultiQuery = async (state: RagEnhancedState): Promise<DocResult[]> =>
    multiQueryRetrieve(state.query, state.spaceIds, state.filter);

  const branch = RunnableBranch.from([
    [
      (s: RagEnhancedState) => s.confidence === "high" && s.action === "top10",
      useTop10,
    ],
    [(s: RagEnhancedState) => s.action === "rerank", doRerank],
    doMultiQuery, // default
  ]);

  return RunnableSequence.from([retrieveAndParse, branch]);
}

let chainInstance: ReturnType<typeof buildRagEnhancedChain> | null = null;

/**
 * RAG 增强检索入口：自适应选择 top-10 / Rerank / Multi-Query
 */
export async function searchWithRagEnhanced(
  userMessage: string,
  spaceIds?: string[]
): Promise<DocResult[]> {
  if (!chainInstance) {
    chainInstance = buildRagEnhancedChain();
  }
  const ids = spaceIds?.length ? spaceIds : [];
  const result = await chainInstance.invoke({
    userMessage,
    spaceIds: ids,
  });
  return Array.isArray(result) ? result : [];
}
