import { streamText } from "ai";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/auth";
import { dashscopeProvider } from "@/lib/llm/llm";
import { getModelConfig, getModelGame, runWithConfigAsync } from "@/lib/llm/model-config";
import { parseUnifiedDiff } from "@/lib/spark/unified-diff";
import { supabaseAdmin } from "@/lib/supabase";

const bodySchema = z.object({
  path: z.string().trim().min(1).max(256),
  prompt: z.string().trim().min(4).max(4000),
  content: z.string().max(1_000_000),
});

function buildSystemPrompt(path: string) {
  return [
    "你是代码补丁生成器。",
    `目标文件: ${path}`,
    "本接口只用于增量修改；只有在修改意图明确时才输出补丁。",
    "你必须只输出 unified diff 的 hunk 段（@@ ... @@ 与行前缀 + - 空格）。",
    "禁止输出解释、禁止 markdown 代码块、禁止输出文件头（---/+++）。",
    "仅返回最小必要改动。",
  ].join("\n");
}

async function generateDiffWithModel({
  path,
  prompt,
  content,
  onDelta,
  abortSignal,
}: {
  path: string;
  prompt: string;
  content: string;
  onDelta?: (delta: string) => void;
  abortSignal?: AbortSignal;
}) {
  const result = await streamText({
    model: dashscopeProvider(getModelGame()),
    abortSignal,
    temperature: 0.1,
    maxTokens: 6000,
    system: buildSystemPrompt(path),
    prompt: [`修改需求：${prompt}`, "", "当前文件内容：", content || "(empty)"].join("\n"),
  });
  let diff = "";
  for await (const delta of result.textStream) {
    diff += delta;
    onDelta?.(delta);
  }
  const cleaned = diff
    .trim()
    .replace(/^```(?:diff)?/i, "")
    .replace(/```$/, "")
    .trim();
  const hunks = parseUnifiedDiff(cleaned);
  return { diff: cleaned, hunks };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  if (!supabaseAdmin) return Response.json({ error: "服务未就绪" }, { status: 503 });

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
  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "游戏不存在" }, { status: 404 });
  if (String(data.user_id) !== user.userId) {
    return Response.json({ error: "无权修改该游戏" }, { status: 403 });
  }

  const config = await getModelConfig();
  const wantsStream = new URL(req.url).searchParams.get("stream") === "1";
  return runWithConfigAsync(config, async () => {
    try {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), 120_000);

      if (!wantsStream) {
        try {
          const generated = await generateDiffWithModel({
            path: parsed.data.path,
            prompt: parsed.data.prompt,
            content: parsed.data.content,
            abortSignal: abortController.signal,
          });
          if (!generated.hunks.length) {
            return Response.json({ error: "模型未返回有效补丁，请重试" }, { status: 500 });
          }
          return Response.json({
            ok: true,
            path: parsed.data.path,
            diff: generated.diff,
            hunks: generated.hunks,
          });
        } finally {
          clearTimeout(timeout);
        }
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          const IDLE_TIMEOUT_MS = 65_000;
          const safeClose = () => {
            if (closed) return;
            closed = true;
            try {
              controller.close();
            } catch {
              // ignore invalid state on already-closed stream
            }
          };
          const send = (event: string, data: unknown) => {
            if (closed) return;
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            } catch {
              safeClose();
            }
          };
          let idleTimer: ReturnType<typeof setTimeout> | null = null;
          const resetIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              send("error", { message: "补丁生成超时（长时间无输出），请重试或缩小修改范围" });
              try {
                abortController.abort();
              } catch {
                // ignore
              }
              safeClose();
            }, IDLE_TIMEOUT_MS);
          };
          resetIdleTimer();

          const run = async () => {
            try {
              const generated = await generateDiffWithModel({
                path: parsed.data.path,
                prompt: parsed.data.prompt,
                content: parsed.data.content,
                abortSignal: abortController.signal,
                onDelta(delta) {
                  resetIdleTimer();
                  send("delta", { text: delta });
                },
              });
              if (!generated.hunks.length) {
                send("error", { message: "模型未返回有效补丁，请重试" });
                safeClose();
                return;
              }
              send("done", {
                ok: true,
                path: parsed.data.path,
                diff: generated.diff,
                hunks: generated.hunks,
              });
            } catch (e) {
              if (e instanceof Error && e.name === "AbortError") {
                if (!closed) {
                  send("error", { message: "补丁生成已中断" });
                }
                return;
              }
              send("error", {
                message: e instanceof Error ? e.message : "生成补丁失败",
              });
            } finally {
              if (idleTimer) clearTimeout(idleTimer);
              clearTimeout(timeout);
              safeClose();
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
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "生成补丁失败" },
        { status: 500 }
      );
    }
  });
}
