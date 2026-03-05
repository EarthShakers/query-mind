# LangChain RAG 检索优化学习路线

> 面向企业级 RAG 的预检索/检索优化技术，结合 LangChain 实现。

---

## 一、技术图谱

| 技术 | 核心思想 | LangChain 对应 | 适用场景 |
|------|----------|----------------|----------|
| **摘要索引** | 存 chunk 摘要，检索时先匹配摘要 | `SummaryIndex` / 自定义 Retriever | 长文档、chunk 尾部信息易丢失 |
| **父子索引** | 小 chunk 检索 + 返回父级上下文 | `ParentDocumentRetriever` | 需要更大上下文窗口 |
| **假设问题索引 (HyDE)** | 用 LLM 生成假设答案，用答案向量检索 | `HypotheticalDocumentEmbedder` | 查询与文档表述差异大 |
| **元数据索引** | 按 metadata 过滤 + 向量检索 | `MetadataFilter` / `SelfQueryRetriever` | 多租户、按来源/时间过滤 |
| **索引小结** | 文档级摘要，粗筛后再细查 | `DocumentSummaryIndex` | 超大文档库、分层检索 |
| **多路召回** | 多路检索结果合并/重排 | `EnsembleRetriever` / `MultiQueryRetriever` | 提升召回率、减少漏检 |

---

## 二、各技术详解

### 1. 摘要索引 (Summary Index)

**原理**：每个 chunk 生成 1–2 句摘要，对摘要做 embedding。检索时用 query 匹配摘要，命中后再取完整 content。

**优点**：摘要更凝练，embedding 语义更集中，减轻长文本稀释。

**LangChain 实现**：
- 方案 A：自定义 Retriever，在 `ingest` 时对每个 chunk 调用 LLM 生成 summary，存 metadata
- 方案 B：用 `SummaryIndex`（若用 LlamaIndex 生态）或 LangChain 的 `VectorStoreRetriever` + 带 summary 的 Document

```typescript
// 伪代码：ingest 时
const summary = await llm.invoke(`用一句话概括：\n${chunk.content}`);
documents.push({ content: chunk.content, metadata: { summary } });
```

---

### 2. 父子索引 (Parent-Child Index)

**原理**：存储时用「小 chunk」做 embedding（便于精确匹配），检索时返回「父级大块」或「父 + 子」组合，保证上下文完整。

**优点**：检索粒度细，返回粒度粗，兼顾精度和上下文。

**LangChain 实现**：
- `ParentDocumentRetriever`：child splitter 切小 chunk，parent splitter 切大块；检索 child，返回 parent
- 需 VectorStore 支持 metadata 存 `parent_id` 或类似关联

```typescript
// 概念：child 存 embedding，parent 存完整 content
// 检索 child → 查 parent_id → 返回 parent content
```

---

### 3. 假设问题索引 (HyDE)

**原理**：用户 query 不直接做 embedding；先用 LLM 根据 query 生成若干「假设的答案片段」，对这些假设答案做 embedding，再用它们去检索。因为假设答案与文档表述更接近，语义匹配更好。

**优点**：query 与文档表述差异大时效果好（如「报销流程」vs 文档写的是「费用申请流程」）。

**LangChain 实现**：
- `HypotheticalDocumentEmbedder`：包装一个 base Retriever，在检索前用 LLM 生成假设文档，再对假设文档做 embedding 检索

```typescript
// 流程：query → LLM 生成假设答案 → embed 假设答案 → 向量检索
```

---

### 4. 元数据索引 (Metadata Index)

**原理**：在向量检索基础上增加 metadata 过滤（如 `space_id`、`source`、`created_at`），先过滤再按相似度排序。

**优点**：多租户、多空间、按来源/时间筛选，减少无关文档。

**LangChain 实现**：
- `SupabaseVectorStore` 的 `filter` 参数
- `SelfQueryRetriever`：用 LLM 把自然语言 query 解析成 metadata 过滤条件（如「最近一周的文档」→ `created_at > 7d ago`）

---

### 5. 索引小结 (Index Summary / Document Summary)

**原理**：文档级摘要，先按文档摘要做粗筛（哪些文档可能相关），再对候选文档的 chunk 做细查。

**优点**：文档库很大时，避免全量 chunk 检索，先缩小范围。

**LangChain 实现**：
- 自定义：每个 document 存一份 summary，先检索 summary，再对命中 doc 的 chunks 做二次检索
- 或使用 `DocumentSummaryIndex`（LlamaIndex 概念）

---

### 6. 多路召回 (Multi-Retrieval)

**原理**：多路检索并行或串行，结果合并（去重、重排）后送入 LLM。

**常见组合**：
- **Multi-Query**：同一 query 生成多个改写 query，分别检索后合并
- **Ensemble**：向量检索 + BM25 关键词检索，加权融合
- **多 Embedding**：不同 embedding 模型各检索一遍，取并集或交集

**LangChain 实现**：
- `MultiQueryRetriever`：自动生成多个 query 变体
- `EnsembleRetriever`：组合多个 Retriever，指定权重
- `ContextualCompressionRetriever`：检索后再用 LLM 压缩/过滤

---

## 三、学习顺序建议

1. **元数据索引** — 最简单，你已有 `space_id` 过滤，先巩固 LangChain + Supabase 集成
2. **摘要索引** — 加 summary 字段，改 ingest 和 retrieval，理解「摘要 vs 原文」的检索差异
3. **多路召回** — 用 `MultiQueryRetriever` 或 `EnsembleRetriever`，体验多路合并
4. **HyDE** — 理解「假设答案」的生成与检索流程
5. **父子索引** — 理解 splitter 策略和 parent-child 关联
6. **索引小结** — 文档级摘要 + 分层检索，适合大库

---

## 四、推荐资源

- [LangChain Docs - Retrievers](https://js.langchain.com/docs/modules/data_connection/retrievers/)
- [LangChain Docs - Vector Stores](https://js.langchain.com/docs/modules/data_connection/vectorstores/)
- [RAG 最佳实践](https://docs.llamaindex.ai/en/stable/optimizing/production_rag/)（LlamaIndex，概念通用）
- [Advanced RAG Techniques](https://www.pinecone.io/learn/advanced-rag-techniques/)（Pinecone 博客）

---

## 五、与当前 ai-sql-demo 的对应关系

| 当前实现 | 可演进方向 |
|----------|------------|
| `splitMarkdown` 分块 | 保持，可加 `ParentDocumentRetriever` 的 child/parent 切分 |
| `embed` 单路向量检索 | 加 `MultiQueryRetriever` 或 `EnsembleRetriever` |
| `match_documents` + space_id | 用 `MetadataFilter` 封装，后续接入 `SelfQueryRetriever` |
| 无摘要 | ✅ 已实现：`ENABLE_SUMMARY_INDEX=true` 时对 chunk 生成摘要并 embedding，存 `metadata.summary` |
| 无 HyDE | 用 `HypotheticalDocumentEmbedder` 包装现有 Retriever |

---

*文档版本：v1.0 | 最后更新：2025-03*
