# 切分策略 TODO

> 已实现：标准、精细（父子）、语义边界。以下为待实现策略。

## 待实现

| 策略 | 说明 | 优先级 |
|------|------|--------|
| **固定长度** | 按字符数/token 数固定切，实现简单，适合无结构文档兜底 | 低 |
| **滑动窗口** | 固定窗口 + 步长滑动，保证 overlap，减少边界信息丢失 | 低 |
| **Token 精确** | 按 LLM token 数切分，精确控制上下文窗口 | 中 |

## 实现建议

- **固定长度**：`RecursiveCharacterTextSplitter` 设 `chunkSize`，无 overlap 或小 overlap
- **滑动窗口**：自定义或 LangChain 的 `CharacterTextSplitter` 配合 `chunkOverlap`
- **Token 精确**：需接入 tiktoken 或类似库，按 token 计数切分

## 参考

- [LangChain Text Splitters](https://js.langchain.com/docs/modules/data_connection/document_transformers/)
- [RAG 最佳实践 - 分块策略](https://docs.llamaindex.ai/en/stable/optimizing/production_rag/)
