import { ChatOpenAI } from "@langchain/openai";

export function createDashScopeLLM() {
  return new ChatOpenAI({
    modelName: "deepseek-v3",
    configuration: {
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: process.env.DASHSCOPE_API_KEY,
    },
    temperature: 0.3,
    maxTokens: 4096,
  });
}
