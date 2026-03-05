import { getDashScopeLLM } from "@/lib/llm";

export function createDashScopeLLM() {
  return getDashScopeLLM({
    model: "deepseek-v3",
    temperature: 0.3,
    maxTokens: 4096,
  });
}
