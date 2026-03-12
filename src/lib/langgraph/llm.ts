import { getDashScopeLLM } from "@/lib/llm/llm";
import { MODEL_AGENT } from "@/lib/llm/models";

export function createDashScopeLLM() {
  return getDashScopeLLM({
    model: MODEL_AGENT,
    temperature: 0.3,
    maxTokens: 4096,
  });
}
