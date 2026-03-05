import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getDashScopeLLM } from "./llm";

/** Self-Query 解析结果：从用户问题中提取检索 query 和元数据过滤条件 */
export interface SelfQueryResult {
  query: string;
  filterTitle?: string;
}

const SelfQuerySchema = z.object({
  query: z.string().describe("用于向量检索的完整问题，保留所有语义"),
  filterTitle: z
    .string()
    .nullable()
    .optional()
    .describe("仅当用户明确指定要查某份文档/文件时填写其标题或文件名；否则必须为 null"),
});

const SELF_QUERY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是检索解析器。从用户问题中解析出：
1. query：用于向量检索的完整问题，保留用户要查找的所有语义（人物、主题、内容等）
2. filterTitle：仅当用户明确说「在 XX 文档里」「根据 YY 文件」「查 ZZ.pdf」这类限定某份文档时，才填该文档/文件的标题；否则必须为 null

【关键】filterTitle 只用于「文档/文件」限定，不能用于人物名、公司名、主题词：
- 「李卓超的帅照」→ query="李卓超的帅照", filterTitle=null（李卓超是人名，不是文档名）
- 「产品手册里的保修期」→ query="保修期", filterTitle="产品手册"
- 「XX.pdf 中的安装步骤」→ query="安装步骤", filterTitle="XX.pdf"
- 「华为的招聘政策」→ query="华为的招聘政策", filterTitle=null（华为是公司名）
- 不确定时，filterTitle 一律填 null`,
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
