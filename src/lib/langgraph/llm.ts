import { getDashScopeLLM } from "@/lib/llm/llm";
import { getModelAgent } from "@/lib/llm/model-config";

export function createDashScopeLLM() {
  return getDashScopeLLM({
    model: getModelAgent(),
    temperature: 0.3,
    maxTokens: 4096,
  });
}
