import { generateText } from "ai";
import { dashscopeProvider } from "@/lib/llm/llm";
import { MODEL_LIGHT } from "@/lib/llm/models";

/** POST /api/reports/generate-title — generate a short noun-phrase title from user message */
export async function POST(req: Request) {
  const { message } = await req.json();

  if (!message || typeof message !== "string") {
    return Response.json({ title: "未命名报告" });
  }

  try {
    const { text } = await generateText({
      model: dashscopeProvider(MODEL_LIGHT),
      system:
        "你是一个标题生成器。根据用户的请求，生成一个简短的名词性报告标题（4-10个字），不要包含动词、标点符号或引号。直接输出标题文本，不要任何解释。",
      prompt: message,
      maxTokens: 30,
    });

    const title = text.trim().replace(/["""''《》【】]/g, "").slice(0, 20) || "未命名报告";
    return Response.json({ title });
  } catch {
    // Fallback: extract key nouns heuristically
    const fallback = message
      .replace(/^(帮我|请|给我|生成|分析|制作|写|做|创建|汇总)+/g, "")
      .replace(/(一份|一个|的|了|吗|吧|呢)+/g, "")
      .trim()
      .slice(0, 15) || "未命名报告";
    return Response.json({ title: fallback });
  }
}
