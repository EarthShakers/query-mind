#!/usr/bin/env tsx
/**
 * RAG 评估 CLI 入口
 *
 * 用法：
 *   npx tsx eval/run.ts                           # 使用内置 sample.json
 *   npx tsx eval/run.ts eval/datasets/custom.json  # 使用自定义数据集
 *   npx tsx eval/run.ts --e2e                      # E2E 模式（调用真实 RAG pipeline）
 *   npx tsx eval/run.ts --e2e --space <uuid>        # E2E 限定空间
 *   npx tsx eval/run.ts --metrics faithfulness,context_precision
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { EvalSample, EvalReport, MetricName } from "./types";
import { evaluate } from "./evaluate";
import { evaluateE2E } from "./e2e";

const VALID_METRICS: MetricName[] = [
  "faithfulness",
  "answer_relevancy",
  "context_precision",
  "context_recall",
];

function parseArgs() {
  const args = process.argv.slice(2);
  let datasetPath: string | undefined;
  let e2e = false;
  let metrics: MetricName[] | undefined;
  let spaceIds: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--e2e") {
      e2e = true;
    } else if (arg === "--space" && args[i + 1]) {
      spaceIds = args[i + 1].split(",");
      i++;
    } else if (arg === "--metrics" && args[i + 1]) {
      metrics = args[i + 1]
        .split(",")
        .filter((m): m is MetricName =>
          VALID_METRICS.includes(m as MetricName)
        );
      i++;
    } else if (!arg.startsWith("--")) {
      datasetPath = arg;
    }
  }

  return { datasetPath, e2e, metrics, spaceIds };
}

function loadDataset(path?: string): EvalSample[] {
  const resolved = path
    ? resolve(process.cwd(), path)
    : resolve(__dirname, "datasets/sample.json");
  const raw = readFileSync(resolved, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error("数据集必须是 EvalSample[] 数组");
  }
  return data as EvalSample[];
}

function printSummary(summary: Record<MetricName, number>) {
  console.log("\n┌─────────────────────────────────────┐");
  console.log("│          评估结果汇总               │");
  console.log("├──────────────────────┬──────────────┤");
  for (const [metric, score] of Object.entries(summary)) {
    if (score === 0 && metric === "context_recall") {
      // 可能是因为没有 ground_truth
      console.log(
        `│ ${metric.padEnd(20)} │ ${score.toFixed(4).padStart(12)} │`
      );
    } else {
      console.log(
        `│ ${metric.padEnd(20)} │ ${score.toFixed(4).padStart(12)} │`
      );
    }
  }
  console.log("└──────────────────────┴──────────────┘");
}

async function main() {
  const { datasetPath, e2e, metrics, spaceIds } = parseArgs();

  console.log("RAG 评估系统 (RAGAS methodology)");
  console.log("================================");

  if (e2e) {
    console.log("模式: E2E（端到端）");
    if (spaceIds) console.log(`空间: ${spaceIds.join(", ")}`);
    const dataset = loadDataset(datasetPath);
    const inputs = dataset.map((s) => ({
      question: s.question,
      ground_truth: s.ground_truth,
    }));
    console.log(`样本数: ${inputs.length}`);
    if (metrics) console.log(`指标: ${metrics.join(", ")}`);

    const report = await evaluateE2E(inputs, {
      metrics,
      spaceIds,
      onSampleGenerated: (i, sample) => {
        console.log(
          `  [${i + 1}/${inputs.length}] 检索到 ${
            sample.contexts.length
          } 个 chunks`
        );
      },
    });

    printSummary(report.summary);
    saveReport(report);
  } else {
    console.log("模式: 标准评估");
    const dataset = loadDataset(datasetPath);
    console.log(`样本数: ${dataset.length}`);
    if (metrics) console.log(`指标: ${metrics.join(", ")}`);

    const report = await evaluate(dataset, {
      metrics,
      datasetPath,
      onSampleDone: (i, result) => {
        const scores = Object.entries(result.metrics)
          .map(([k, v]) => `${k}=${v?.toFixed(2)}`)
          .join(" ");
        console.log(`  [${i + 1}/${dataset.length}] ${result.question}`);
        console.log(`    ${scores}`);
      },
    });

    printSummary(report.summary);
    saveReport(report);
  }
}

function saveReport(report: EvalReport) {
  const dir = resolve(__dirname, "reports");
  mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = resolve(dir, `report-${ts}.json`);
  const htmlPath = resolve(dir, `report-${ts}.html`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(htmlPath, buildHtml(report), "utf-8");

  console.log(`\nJSON 报告: ${jsonPath}`);
  console.log(`HTML 报告: ${htmlPath}`);
}

function buildHtml(report: EvalReport): string {
  const { samples, summary, timestamp, meta } = report;

  const scoreColor = (v: number) =>
    v >= 0.9 ? "#22c55e" : v >= 0.7 ? "#eab308" : "#ef4444";

  const summaryRows = Object.entries(summary)
    .map(
      ([k, v]) =>
        `<tr><td>${k}</td><td style="color:${scoreColor(v)};font-weight:700">${v.toFixed(4)}</td></tr>`
    )
    .join("");

  const sampleCards = samples
    .map((s, i) => {
      const metricBadges = Object.entries(s.metrics)
        .map(
          ([k, v]) =>
            `<span class="badge" style="background:${scoreColor(v ?? 0)}">${k}: ${(v ?? 0).toFixed(2)}</span>`
        )
        .join(" ");

      const traceDetails = s.traces
        .map(
          (t) => `
        <details>
          <summary>${t.metric} = ${t.score.toFixed(4)}</summary>
          <pre>${JSON.stringify(t.details, null, 2)}</pre>
        </details>`
        )
        .join("");

      return `
      <div class="card">
        <h3>#${i + 1} ${escapeHtml(s.question)}</h3>
        <p class="answer">${escapeHtml(s.answer)}</p>
        <div class="badges">${metricBadges}</div>
        ${traceDetails}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RAG Eval Report — ${timestamp}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:960px;margin:auto}
  h1{font-size:1.5rem;margin-bottom:.25rem}
  .meta{color:#94a3b8;font-size:.85rem;margin-bottom:1.5rem}
  table{width:100%;border-collapse:collapse;margin-bottom:2rem}
  th,td{padding:.6rem 1rem;text-align:left;border-bottom:1px solid #1e293b}
  th{color:#94a3b8;font-weight:500}
  .card{background:#1e293b;border-radius:.5rem;padding:1.25rem;margin-bottom:1rem}
  .card h3{font-size:1rem;margin-bottom:.5rem}
  .answer{color:#94a3b8;font-size:.9rem;margin-bottom:.75rem}
  .badges{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem}
  .badge{color:#fff;padding:.15rem .5rem;border-radius:.25rem;font-size:.75rem}
  details{margin-top:.5rem}
  summary{cursor:pointer;color:#60a5fa;font-size:.85rem}
  pre{background:#0f172a;padding:.75rem;border-radius:.25rem;font-size:.8rem;overflow-x:auto;margin-top:.5rem;color:#cbd5e1}
</style>
</head>
<body>
  <h1>RAG 评估报告</h1>
  <p class="meta">${timestamp} · ${meta?.sampleCount ?? samples.length} 条样本 · 指标: ${meta?.metricsUsed?.join(", ") ?? "all"}</p>

  <h2 style="font-size:1.1rem;margin-bottom:.5rem">汇总</h2>
  <table>
    <tr><th>指标</th><th>得分</th></tr>
    ${summaryRows}
  </table>

  <h2 style="font-size:1.1rem;margin-bottom:.75rem">样本详情</h2>
  ${sampleCards}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
