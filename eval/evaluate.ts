/**
 * 评估编排器：evaluateSample + batch evaluate
 */
import type {
  EvalSample,
  EvalSampleResult,
  EvalReport,
  MetricName,
  MetricFn,
} from "./types";
import {
  faithfulness,
  answerRelevancy,
  contextPrecision,
  contextRecall,
} from "./metrics";
import { sleep } from "./utils";

const METRIC_REGISTRY: Record<MetricName, MetricFn> = {
  faithfulness,
  answer_relevancy: answerRelevancy,
  context_precision: contextPrecision,
  context_recall: contextRecall,
};

const ALL_METRICS: MetricName[] = [
  "faithfulness",
  "answer_relevancy",
  "context_precision",
  "context_recall",
];

/** 评估单条样本 */
export async function evaluateSample(
  sample: EvalSample,
  metrics: MetricName[] = ALL_METRICS
): Promise<EvalSampleResult> {
  const result: EvalSampleResult = {
    question: sample.question,
    answer: sample.answer,
    metrics: {},
    traces: [],
  };

  for (const name of metrics) {
    const fn = METRIC_REGISTRY[name];
    if (!fn) continue;
    const trace = await fn(sample);
    result.metrics[name] = trace.score;
    result.traces.push(trace);
  }

  return result;
}

/** 批量评估并生成报告 */
export async function evaluate(
  dataset: EvalSample[],
  options?: {
    metrics?: MetricName[];
    delayMs?: number;
    datasetPath?: string;
    onSampleDone?: (index: number, result: EvalSampleResult) => void;
  }
): Promise<EvalReport> {
  const metrics = options?.metrics ?? ALL_METRICS;
  const delayMs = options?.delayMs ?? 500;
  const samples: EvalSampleResult[] = [];

  for (let i = 0; i < dataset.length; i++) {
    const result = await evaluateSample(dataset[i], metrics);
    samples.push(result);
    options?.onSampleDone?.(i, result);

    // 样本间延迟，避免限流
    if (i < dataset.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const summary = {} as Record<MetricName, number>;
  for (const m of ALL_METRICS) {
    const scores = samples
      .map((s) => s.metrics[m])
      .filter((v): v is number => v !== undefined);
    summary[m] = avg(scores);
  }

  return {
    samples,
    summary,
    timestamp: new Date().toISOString(),
    meta: {
      datasetPath: options?.datasetPath,
      metricsUsed: metrics,
      sampleCount: dataset.length,
    },
  };
}
