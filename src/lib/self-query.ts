import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getDashScopeLLM } from "./llm";

/** Self-Query 解析结果：从用户问题中提取检索 query 和元数据过滤条件 */
export interface SelfQueryResult {
  query: string;
  filterTitle?: string;
}

const SelfQuerySchema = z.object({
  query: z.string().describe("用于向量检索的核心问题，去掉文档限定词"),
  filterTitle: z
    .string()
    .nullable()
    .optional()
    .describe("用户明确指定的文档名/文件名，如「产品手册」「XX.pdf」；无则 null"),
});

const SELF_QUERY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一个检索解析器。根据用户的自然语言问题，解析出：
1. query：用于向量检索的核心问题（去掉文档限定词，保留要查找的内容）
2. filterTitle：仅当用户明确提到具体文档名、文件名、书名时填写；否则为 null

规则：filterTitle 只填名称本身，不要扩展名外的多余词。`,
  ],
  ["human", "{message}"],
]);

/**
 * Self-Query：用 LangChain 从用户问题中解析出 query 和 metadata 过滤条件
 */
export async function parseSelfQuery(userMessage: string): Promise<SelfQueryResult> {
  if (!userMessage?.trim()) {
    return { query: "" };
  }

  try {
    const llm = getDashScopeLLM({ model: "qwen-turbo", maxTokens: 150 });
    const structuredLlm = llm.withStructuredOutput(SelfQuerySchema);

    const chain = SELF_QUERY_PROMPT.pipe(structuredLlm);
    const result = (await chain.invoke({ message: userMessage.trim() })) as z.infer<typeof SelfQuerySchema>;

    const query = result?.query?.trim() || userMessage.trim();
    const filterTitle =
      result?.filterTitle && typeof result.filterTitle === "string" && result.filterTitle.trim()
        ? result.filterTitle.trim()
        : undefined;

    return { query, filterTitle };
  } catch {
    return { query: userMessage.trim() };
  }
}
