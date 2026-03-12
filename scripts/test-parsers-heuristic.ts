import assert from "node:assert/strict";
import { isLikelyComplexLayoutPdf } from "../src/lib/rag/parsers";

type Case = {
  name: string;
  text: string;
  expected: boolean;
};

const cases: Case[] = [
  {
    name: "resume style with tabs should stay local",
    text: [
      "教育经历",
      "中南财经政法大学\t硕士\t2024-2026",
      "河南科技学院\t本科\t2020-2024",
      "项目经历",
      "个人博客系统\tVue2\tMongoDB",
      "技能：HTML\tCSS\tJavaScript\tVue",
      "自我评价：编码规范良好，注重可维护性。",
    ].join("\n"),
    expected: false,
  },
  {
    name: "markdown table should use cloud parse",
    text: [
      "| name | score | class |",
      "| ---- | ----- | ----- |",
      "| Alice | 95 | A1 |",
      "| Bob | 88 | A1 |",
      "| Carol | 91 | A2 |",
    ].join("\n"),
    expected: true,
  },
  {
    name: "plain paragraph text should stay local",
    text: [
      "这是一个纯文本段落，没有明显的表格结构，也没有多列排版。",
      "我们希望在这种情况下走本地 pdf-parse，避免无意义的云解析成本。",
      "RAG 检索只需要语义文本即可。",
    ].join("\n"),
    expected: false,
  },
  {
    name: "number-heavy sentence should not be treated as table",
    text: [
      "The years 2020 2021 2022 2023 saw continuous growth in active users.",
      "Revenue in 2023 was 1200000 while 2024 reached 1500000.",
    ].join("\n"),
    expected: false,
  },
];

let passed = 0;
for (const item of cases) {
  const actual = isLikelyComplexLayoutPdf(item.text);
  assert.equal(
    actual,
    item.expected,
    `[${item.name}] expected=${item.expected} actual=${actual}`
  );
  passed += 1;
}

console.log(`heuristic tests passed: ${passed}/${cases.length}`);
