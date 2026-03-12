/**
 * RAG 增强检索：基于置信度的自适应策略
 * 1. 先检索 top-20
 * 2. 计算置信度（score_gap、score_std、score[0] 阈值）
 * 3. 高置信度 → 直接用 top-10
 * 4. 低置信度 → Rerank 或 Multi-Query
 * 5. 统一过滤：相似度断崖截断 + 下限过滤，输出 3~10 个高质量 chunk
 */
import { RunnableSequence, RunnableBranch } from "@langchain/core/runnables";
import { searchDocuments, type DocResult, type SearchFilter } from "./rag";
import { parseSelfQuery } from "./self-query";
import { getDashScopeLLM } from "./llm";
import { MODEL_LIGHT, MODEL_RERANK } from "./models";
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

/** 相似度下限：低于此值的 chunk 直接丢弃 */
const SIMILARITY_FLOOR = parseThreshold(process.env.RAG_SIMILARITY_FLOOR, 0.35);
/** 相似度断崖比例：当 chunk 分数 < 前一个 * DROP_RATIO 时截断 */
const DROP_RATIO = parseThreshold(process.env.RAG_DROP_RATIO, 0.7);
/** 过滤后最少保留的结果数 */
const MIN_RESULTS = parseInt(process.env.RAG_MIN_RESULTS ?? "3", 10);

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


/** Rerank：使用百炼 qwen3-rerank */
async function rerankDocs(
  query: string,
  docs: DocResult[]
): Promise<DocResult[]> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey || docs.length === 0) {
    return docs.slice(0, TOP_K_FINAL);
  }

  const documents = docs.map((d) => `${d.title}\n\n${d.content}`);

  console.log(
    `[RAG-Enhanced] DashScope rerank 开始: query="${query}", ${documents.length} docs`
  );

  const resp = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_RERANK,
        input: { query, documents },
        parameters: { top_n: TOP_K_FINAL, return_documents: false },
      }),
    }
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`DashScope rerank failed: ${resp.status} ${body}`);
  }

  const data = (await resp.json()) as {
    output: { results: { index: number; relevance_score: number }[] };
  };

  const results = data.output.results;
  const reranked = results
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, TOP_K_FINAL)
    .map((r) => ({
      ...docs[r.index],
      similarity: r.relevance_score,
    }));

  console.log(`[RAG-Enhanced] DashScope rerank 完成: ${reranked.length} docs`);
  reranked.forEach((r, i) => {
    console.log(
      `  [${i + 1}] ${r.title.slice(0, 40)} (sim=${r.similarity.toFixed(3)})`
    );
  });

  return reranked;
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
  const llm = getDashScopeLLM({ model: MODEL_LIGHT, maxTokens: 200 });
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
    const result = (await prompt
      .pipe(structuredLlm)
      .invoke({ query })) as z.infer<typeof MultiQuerySchema>;
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

/**
 * 相似度断崖截断 + 下限过滤
 * 1. 检测相似度骤降点，在断崖处截断
 * 2. 过滤掉 similarity < SIMILARITY_FLOOR 的 chunk
 * 3. 保证至少返回 MIN_RESULTS 个结果
 */
function filterByRelevance(docs: DocResult[]): DocResult[] {
  if (docs.length <= MIN_RESULTS) return docs;

  // 断崖截断：当某 chunk 分数 < 前一个 * DROP_RATIO 时截断
  let cliffIdx = docs.length;
  for (let i = 1; i < docs.length; i++) {
    if (docs[i].similarity < docs[i - 1].similarity * DROP_RATIO) {
      cliffIdx = i;
      break;
    }
  }

  // 下限过滤：去掉低于 SIMILARITY_FLOOR 的
  const floorIdx = docs.findIndex((d) => d.similarity < SIMILARITY_FLOOR);
  const cutoff = floorIdx > 0 ? Math.min(cliffIdx, floorIdx) : cliffIdx;

  // 保证至少 MIN_RESULTS 个
  const finalCount = Math.max(Math.min(cutoff, docs.length), MIN_RESULTS);
  return docs.slice(0, finalCount);
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
    let results = await searchDocuments(query, TOP_K_INITIAL, spaceIds, filter);
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

  const doRerank = async (state: RagEnhancedState): Promise<DocResult[]> => {
    const hasDashScope = !!process.env.DASHSCOPE_API_KEY;
    if (!hasDashScope) {
      console.log("[RAG-Enhanced] DashScope 未配置，rerank 回退到 multi-query");
      return multiQueryRetrieve(state.query, state.spaceIds, state.filter);
    }
    try {
      return await rerankDocs(state.query, state.results);
    } catch (e) {
      console.warn("[RAG-Enhanced] rerank 失败，回退到 multi-query:", e);
      return multiQueryRetrieve(state.query, state.spaceIds, state.filter);
    }
  };

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

  const branchThenFilter = RunnableSequence.from([
    branch,
    (docs: DocResult[]) => {
      const filtered = filterByRelevance(docs);
      console.log(
        `[RAG-Enhanced] 过滤: ${docs.length} → ${filtered.length} chunks` +
          (filtered.length > 0
            ? ` (similarity ${filtered[0].similarity.toFixed(3)}~${filtered[
                filtered.length - 1
              ].similarity.toFixed(3)})`
            : "")
      );
      return filtered;
    },
  ]);

  return RunnableSequence.from([retrieveAndParse, branchThenFilter]);
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
