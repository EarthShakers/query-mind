/**
 * 快速诊断：测试几个 E2E 问题的检索结果
 * 用法：npx tsx eval/diagnose-retrieval.ts
 */
import "dotenv/config";
import { searchWithRagEnhanced } from "../src/lib/rag-enhanced";
import { searchDocuments } from "../src/lib/rag";

const QUESTIONS = [
  "出差住宿费的报销标准是多少？",
  "员工年假有多少天？",
  "QueryMind 是什么产品？",
  "什么是 HyDE 假设问题索引？",
];

async function main() {
  for (const q of QUESTIONS) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`问题: ${q}`);
    console.log("=".repeat(60));

    // 1. 直接向量检索（不走 Self-Query / 置信度路由）
    console.log("\n--- 直接向量检索 (top 3) ---");
    const direct = await searchDocuments(q, 3);
    if (direct.length === 0) {
      console.log("  (无结果)");
    }
    for (const r of direct) {
      console.log(
        `  [${r.similarity.toFixed(4)}] ${r.title} | ${r.content.slice(0, 80).replace(/\n/g, " ")}...`
      );
    }

    // 2. 走完整 RAG 增强链
    console.log("\n--- RAG 增强检索 ---");
    const enhanced = await searchWithRagEnhanced(q);
    if (enhanced.length === 0) {
      console.log("  (无结果)");
    }
    for (const r of enhanced.slice(0, 3)) {
      console.log(
        `  [${r.similarity.toFixed(4)}] ${r.title} | ${r.content.slice(0, 80).replace(/\n/g, " ")}...`
      );
    }
    console.log(`  共 ${enhanced.length} 条结果`);
  }
}

main().catch(console.error);
