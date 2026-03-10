# RAG 质量评估

> 建立 RAG 质量评估体系，实现「可度量、可优化、可闭环」。
> 产品规划见 [PRODUCT_CAPABILITIES.md](PRODUCT_CAPABILITIES.md#rag-应用评估)。

---

## 一、工作项总览

| 工作项                | 重要度 | 状态 | 具体内容                                                                                            |
| --------------------- | ------ | ---- | --------------------------------------------------------------------------------------------------- |
| **1. 指标体系搭建**   | ★★★★★  | ✅   | 定义检索质量 + 生成质量指标，与 RAG Pipeline 各阶段对齐（见下文第二章）                             |
| **2. TS 评估库集成**  | ★★★★★  | ✅   | RAGAS 方法论实现（`eval/`），支持 Faithfulness、Answer Relevancy、Context Precision、Context Recall |
| **3. 评估数据集**     | ★★★★★  | ✅   | 内置 `eval/datasets/sample.json`，支持自定义数据集                                                  |
| **4. 自动化基准测试** | ★★★★☆  | ✅   | CLI 评估脚本，支持标准评估 + E2E 评估，按指标筛选                                                   |
| **5. 用户反馈闭环**   | ★★★★☆  | ❌   | 点赞/点踩 + 反馈内容落库，与评估数据关联，用于模型微调或 prompt 优化                                |
| **6. 评估看板**       | ★★★☆☆  | ✅   | `/eval` 页面：最新分数卡片 + Recharts 趋势折线图 + 历史记录表格，数据持久化到 `eval_runs` 表        |
| **7. 自动化定时评估** | ★★★☆☆  | ✅   | GitHub Actions Cron 每天 8:00 / 20:00 自动运行 E2E 评估，结果自动入库                               |
| **8. 持续迭代机制**   | ★★★☆☆  | ❌   | 周基准测试、月对抗评估、季度全面审计，形成评估飞轮                                                  |

---

## 二、指标体系搭建 【已完成】

> 定义检索质量 + 生成质量指标，与 RAG Pipeline 各阶段对齐。

### 2.1 指标与 RAG Pipeline 对应关系

| RAG 阶段 | 指标              | 说明                               |
| -------- | ----------------- | ---------------------------------- |
| **检索** | Context Precision | 检索文档与问题的相关性             |
| **检索** | Context Recall    | 检索信息的完整性，是否覆盖关键信息 |
| **生成** | Faithfulness      | 答案是否基于检索上下文，检测幻觉   |
| **生成** | Answer Relevancy  | 答案与问题的匹配程度               |

### 2.2 指标定义与计算方式（RAGAS 方法论）

| 指标                  | 定义                                   | 计算方式                                                                              |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| **Faithfulness**      | 答案中的声明是否都能从 contexts 中推断 | LLM 分解 answer 为原子声明 → LLM 逐条验证是否被 contexts 支持 → supported/total       |
| **Answer Relevancy**  | 答案与问题的匹配程度                   | LLM 从 answer 反向生成 3 个问题 → Embedding 相似度与原始问题比较 → mean(similarities) |
| **Context Precision** | 检索到的文档中，相关文档的排序质量     | LLM 判断每个 chunk 是否相关 → 加权 precision@k（奖励相关文档排在前面）                |
| **Context Recall**    | 参考答案的关键信息有多少被检索覆盖     | LLM 分解 ground_truth 为原子声明 → LLM 检查每条是否被 contexts 覆盖 → covered/total   |

### 2.3 评估数据集格式

```ts
interface EvalSample {
  question: string; // 用户问题
  contexts: string[]; // 检索到的 chunk 列表
  answer: string; // 系统生成的答案
  ground_truth?: string; // 参考答案（用于 Context Recall）
}
```

---

## 三、TS 评估库 【已完成】

采用 RAGAS 方法论自写评估逻辑，与 DashScope 集成，无需 Python 子进程。

### 3.1 目录结构

```
eval/
  types.ts                    -- 类型定义
  utils.ts                    -- 工具函数（cosineSimilarity、batchEmbed 等）
  metrics/
    faithfulness.ts           -- Claim 分解 + 逐条验证
    answer-relevancy.ts       -- 反向问题生成 + Embedding 相似度
    context-precision.ts      -- LLM 相关性判断 + 加权 precision@k
    context-recall.ts         -- Ground truth claim 分解 + 覆盖检查
    index.ts                  -- Barrel export
  evaluate.ts                 -- 编排器
  e2e.ts                      -- 端到端评估（调用真实 RAG pipeline）
  run.ts                      -- CLI 入口
  datasets/
    sample.json               -- 内置评估数据集
```

### 3.2 使用方式

```bash
# 标准评估（使用内置数据集）
npm run eval:rag

# 标准评估（自定义数据集）
npm run eval:rag -- eval/datasets/custom.json

# E2E 评估（调用真实 RAG pipeline，需 Supabase 环境变量）
npm run eval:rag:e2e

# 指定评估指标
npm run eval:rag -- --metrics faithfulness,context_precision
```

### 3.3 每样本 LLM 开销

| 指标              | LLM 调用 (qwen-turbo) | Embedding 调用       |
| ----------------- | --------------------- | -------------------- |
| Faithfulness      | 2（分解 + 验证）      | 0                    |
| Answer Relevancy  | 1（生成问题）         | 4（1 原始 + 3 生成） |
| Context Precision | 1（判断相关性）       | 0                    |
| Context Recall    | 2（分解 + 归因）      | 0                    |
| **合计**          | **6**                 | **4**                |

**依赖**：`DASHSCOPE_API_KEY`（Embedding + LLM）

---

## 四、下一步

1. ~~指标体系搭建 — 已完成~~
2. ~~TS 评估库集成 — 已完成~~
3. ~~评估数据集构建 — 已完成（内置 sample.json）~~
4. ~~自动化基准测试 — 已完成（CLI 工具）~~
5. 用户反馈闭环
6. ~~评估看板 — 已完成（`/eval` 页面 + Supabase 持久化 + Recharts 趋势图）~~
7. ~~自动化定时评估 — 已完成（GitHub Actions Cron）~~
8. 持续迭代机制
