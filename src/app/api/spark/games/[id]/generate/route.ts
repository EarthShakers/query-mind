import { streamText } from "ai";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/auth";
import { dashscopeProvider } from "@/lib/llm/llm";
import { getModelConfig, getModelGame, runWithConfigAsync } from "@/lib/llm/model-config";
import { supabaseAdmin } from "@/lib/supabase";

const bodySchema = z.object({
  prompt: z.string().trim().min(4).max(4000),
  persist: z.boolean().optional(),
});

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function buildSystemPrompt() {
  return [
    "你是资深 HTML5 游戏工程师。",
    "只输出完整可运行的 index.html 代码，不要解释，不要 Markdown 代码块，不要额外文本。",
    "必须内联 CSS 和 JS（单文件），保证直接打开即可运行。",
    "游戏需支持桌面与移动端，自适应布局，性能稳定。",
    "如果用户描述是修改需求，你要在保留已有玩法核心的前提下改进。",
    "如果用户要求“重新生成/从头重做/全量重写”，你必须忽略旧代码，直接重写完整 index.html。",
  ].join("\n");
}

async function generateHtmlWithModel({
  slug,
  title,
  prompt,
  existingHtml,
  onDelta,
}: {
  slug: string;
  title: string;
  prompt: string;
  existingHtml: string;
  onDelta?: (delta: string) => void;
}) {
  const result = await streamText({
    model: dashscopeProvider(getModelGame()),
    temperature: 0.2,
    maxTokens: 12000,
    system: buildSystemPrompt(),
    prompt: [
      `游戏标识: ${slug}`,
      `游戏标题: ${title}`,
      "",
      "用户需求：",
      prompt,
      "",
      "当前 index.html（若为空代表新建）：",
      existingHtml || "(empty)",
    ].join("\n"),
  });
  let text = "";
  for await (const delta of result.textStream) {
    text += delta;
    onDelta?.(delta);
  }
  const html = stripMarkdownFence(text);
  return { html };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return Response.json(
      { error: "服务器未配置 SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }
  const supabase = supabaseAdmin;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "无效 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const { data: game, error: gameError } = await supabase
    .from("spark_snapshots")
    .select("id, user_id, slug, title, files")
    .eq("id", id)
    .maybeSingle();

  if (gameError) {
    return Response.json({ error: gameError.message }, { status: 500 });
  }
  if (!game) {
    return Response.json({ error: "游戏不存在" }, { status: 404 });
  }
  if (game.user_id !== user.userId) {
    return Response.json({ error: "无权修改该游戏" }, { status: 403 });
  }

  const existingFiles = (game.files as Record<string, string> | null) ?? {};
  const existingHtml =
    typeof existingFiles["index.html"] === "string" ? existingFiles["index.html"] : "";

  const config = await getModelConfig();
  const wantsStream = new URL(req.url).searchParams.get("stream") === "1";
  return runWithConfigAsync(config, async () => {
    try {
      const writeSnapshot = async (html: string) => {
        if (parsed.data.persist === false) {
          return null;
        }
        if (!html.toLowerCase().includes("<html") || !html.toLowerCase().includes("</html>")) {
          throw new Error("模型返回内容不是完整 HTML，请重试");
        }
        const nextFiles = {
          ...existingFiles,
          "index.html": html,
        };
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("spark_snapshots")
          .update({
            files: nextFiles,
            updated_at: now,
            review_status: "pending",
            review_note: null,
            reviewed_by: null,
            reviewed_at: null,
          })
          .eq("id", id)
          .eq("user_id", user.userId);
        if (updateError) throw new Error(updateError.message);
        return now;
      };

      if (!wantsStream) {
        const generated = await generateHtmlWithModel({
          slug: String(game.slug),
          title: String((game as { title?: string | null }).title || game.slug),
          prompt: parsed.data.prompt,
          existingHtml,
        });
        const now = await writeSnapshot(generated.html);
        return Response.json({ ok: true, updated_at: now, html: generated.html });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          };
          const run = async () => {
            try {
              const generated = await generateHtmlWithModel({
                slug: String(game.slug),
                title: String((game as { title?: string | null }).title || game.slug),
                prompt: parsed.data.prompt,
                existingHtml,
                onDelta(delta) {
                  send("delta", { text: delta });
                },
              });
              const now = await writeSnapshot(generated.html);
              send("done", { ok: true, updated_at: now, html: generated.html });
            } catch (error) {
              send("error", {
                message: error instanceof Error ? error.message : "生成失败",
              });
            } finally {
              controller.close();
            }
          };
          void run();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "生成失败" },
        { status: 500 }
      );
    }
  });
}
