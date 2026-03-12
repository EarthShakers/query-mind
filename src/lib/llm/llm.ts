import { createOpenAI } from "@ai-sdk/openai";
import { ChatOpenAI } from "@langchain/openai";
import { MODEL_LIGHT } from "./models";

const DASHSCOPE_CONFIG = {
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
} as const;

/** AI SDK 用：供 streamText、generateText 等使用 */
export const dashscopeProvider = createOpenAI({
  apiKey: DASHSCOPE_CONFIG.apiKey,
  baseURL: DASHSCOPE_CONFIG.baseURL,
});

/** LangChain 用：供 ChatPromptTemplate、withStructuredOutput 等使用 */
export function getDashScopeLLM(options?: {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  return new ChatOpenAI({
    modelName: options?.model ?? MODEL_LIGHT,
    configuration: {
      baseURL: DASHSCOPE_CONFIG.baseURL,
      apiKey: DASHSCOPE_CONFIG.apiKey,
    },
    temperature: options?.temperature ?? 0.2,
    maxTokens: options?.maxTokens ?? 512,
  });
}
