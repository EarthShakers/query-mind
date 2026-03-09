/**
 * RAG 评估类型定义
 * @see docs/RAG_EVALUATION.md
 */

/** 单条评估样本 */
export interface EvalSample {
  question: string;
  contexts: string[];
  answer: string;
  ground_truth?: string;
}

/** 指标名称 */
export type MetricName =
  | "faithfulness"
  | "answer_relevancy"
  | "context_precision"
  | "context_recall";

/** 指标执行追踪（调试用） */
export interface MetricTrace {
  metric: MetricName;
  score: number;
  details: Record<string, unknown>;
}

/** 单条样本的评估结果 */
export interface EvalSampleResult {
  question: string;
  answer: string;
  metrics: Partial<Record<MetricName, number>>;
  traces: MetricTrace[];
}

/** 批量评估汇总结果 */
export interface EvalReport {
  samples: EvalSampleResult[];
  summary: Record<MetricName, number>;
  timestamp: string;
  meta?: {
    datasetPath?: string;
    metricsUsed: MetricName[];
    sampleCount: number;
  };
}

/** 指标计算函数签名 */
export type MetricFn = (sample: EvalSample) => Promise<MetricTrace>;
