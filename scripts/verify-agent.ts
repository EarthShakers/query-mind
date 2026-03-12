#!/usr/bin/env tsx
/**
 * Agent 验证脚本
 *
 * 用法：
 *   pnpm tsx scripts/verify-agent.ts                    # 仅测试 classify 分类
 *   pnpm tsx scripts/verify-agent.ts --full            # 跑完整 Agent（需 --space）
 *   pnpm tsx scripts/verify-agent.ts --full --space <uuid>
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { classifyComplexity } from "../src/lib/agent/classify";
import { buildAgentGraph } from "../src/lib/agent/agent-graph";

interface AgentEvalSample {
  question: string;
  expected_tools: string[];
  complexity: "simple" | "complex";
}

async function testClassify() {
  const path = resolve(process.cwd(), "eval/agent-eval.json");
  const raw = readFileSync(path, "utf-8");
  const samples = JSON.parse(raw) as AgentEvalSample[];

  console.log("\n=== 1. 复杂度分类测试 ===\n");

  let passed = 0;
  for (const s of samples) {
    const { complexity } = await classifyComplexity(s.question, {
      hasKnowledge: true,
      hasTables: true,
    });
    const ok = complexity === s.complexity;
    if (ok) passed++;
    console.log(
      `${ok ? "✅" : "❌"} "${s.question.slice(0, 30)}..." → ${complexity} (期望: ${s.complexity})`
    );
  }
  console.log(`\n分类准确率: ${passed}/${samples.length}\n`);
  return passed === samples.length;
}

async function testFullAgent(spaceId: string) {
  console.log("\n=== 2. 完整 Agent 测试 ===\n");

  const graph = buildAgentGraph();
  const question = "找销量最高的产品，查知识库找该产品说明";

  const state = await graph.invoke(
    {
      userMessage: question,
      conversationHistory: [],
      spaceIds: [spaceId],
      tableSchemas: "",
      enableKnowledge: true,
      enableQuery: false,
    },
    { recursionLimit: 25 }
  );

  const answer = (state.finalAnswer as string)?.trim() || "";
  const plan = state.plan as { sub_tasks?: unknown[] } | undefined;
  const hasPlan = !!plan?.sub_tasks?.length;
  const hasToolResults = Object.keys(state.toolResults || {}).length > 0;

  console.log("问题:", question);
  console.log("有规划:", hasPlan ? "✅" : "❌");
  console.log("有工具结果:", hasToolResults ? "✅" : "❌");
  console.log("回答长度:", answer.length, "字");
  console.log("回答预览:", answer.slice(0, 150) + (answer.length > 150 ? "..." : ""));
  console.log("");

  return hasPlan && answer.length > 20;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let full = false;
  let spaceId = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--full") full = true;
    if (args[i] === "--space" && args[i + 1]) {
      spaceId = args[i + 1];
      i++;
    }
  }
  return { full, spaceId };
}

async function main() {
  const { full, spaceId } = parseArgs();

  const classifyOk = await testClassify();
  if (!classifyOk) {
    console.log("⚠️ 分类测试未完全通过，请检查 classify 逻辑\n");
  }

  if (full) {
    if (!spaceId) {
      console.log("--full 模式需指定 --space <space_uuid>，跳过完整 Agent 测试");
      console.log("示例: pnpm tsx scripts/verify-agent.ts --full --space 00000000-0000-0000-0000-000000000001\n");
    } else {
      const agentOk = await testFullAgent(spaceId);
      console.log(agentOk ? "✅ Agent 完整流程正常" : "❌ Agent 可能有问题\n");
      process.exit(agentOk ? 0 : 1);
    }
  }

  process.exit(classifyOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
