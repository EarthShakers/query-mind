import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getDashScopeLLM } from "../llm/llm";
import { MODEL_LIGHT } from "../llm/models";

const summaryPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "你是一个专业的文档摘要助手。保持客观、简洁，只输出概括结果，不要添加额外说明。",
  ],
  ["human", "用一句话概括以下文本的核心内容：\n\n{content}"],
]);

/**
 * 使用 LangChain ChatOpenAI 为 chunk 生成 1-2 句摘要
 * 用于摘要索引：对摘要做 embedding，减轻长文本稀释
 */
export async function generateChunkSummary(content: string): Promise<string> {
  if (!content.trim()) return "";

  const llm = getDashScopeLLM({ model: MODEL_LIGHT, temperature: 0.2, maxTokens: 512 });

  try {
    const chain = summaryPrompt.pipe(llm);
    const response = await chain.invoke({ content: content.slice(0, 2000) });

    const raw =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
        ? (response.content as { text?: string }[])
            .map((c) => (typeof c === "string" ? c : c?.text ?? ""))
            .join("")
        : "";

    return raw.trim().slice(0, 500) || content.slice(0, 200);
  } catch {
    return content.slice(0, 200);
  }
}
