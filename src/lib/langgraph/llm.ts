import { getDashScopeLLM } from "@/lib/llm";
import { MODEL_AGENT } from "@/lib/models";

export function createDashScopeLLM() {
  return getDashScopeLLM({
    model: MODEL_AGENT,
    temperature: 0.3,
    maxTokens: 4096,
  });
}
