import chalk from "chalk";
import ora from "ora";
import readline from "node:readline";
import { normalizeApiBase, type AppConfig } from "./config.js";
import { resolveLocalGameApiBase } from "./discover.js";
import type { FileContext } from "./context.js";
import { collectLocalContext } from "./context.js";
import { executeTool } from "./tools.js";
import { startPreviewServer, type PreviewServer } from "./preview.js";
import {
  appendSparkInputHistory,
  loadSparkInputHistory,
  SPARK_INPUT_HISTORY_MAX,
} from "./input-history.js";
import { pushSparkSnapshot } from "./snapshot.js";
import open from "open";

interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * @ai-sdk/ui-utils 数据流（与 toDataStreamResponse 一致）
 * 见 node_modules/@ai-sdk/ui-utils stream-parts：
 * 0=text, 3=error, 9=tool_call, a=tool_result, b=tool_call_streaming_start,
 * c=tool_call_delta, d=finish_message, e=finish_step
 */
function parseDataStreamLine(line: string): {
  type: string;
  value: unknown;
} | null {
  if (!line || line.startsWith(":")) return null; // comment or keepalive

  const colonIdx = line.indexOf(":");
  if (colonIdx < 1) return null;

  const type = line.slice(0, colonIdx);
  const raw = line.slice(colonIdx + 1);

  try {
    return { type, value: JSON.parse(raw) };
  } catch {
    return { type, value: raw };
  }
}

export async function startChat(config: AppConfig, cwd: string): Promise<void> {
  const messages: Message[] = [];
  let previewServer: PreviewServer | null = null;
  let previewOpened = false;

  const resolvedApiBase = await resolveLocalGameApiBase(config.apiBase);
  const chatConfig: AppConfig = { ...config, apiBase: resolvedApiBase };
  if (normalizeApiBase(config.apiBase) !== resolvedApiBase) {
    console.log(
      chalk.dim(
        `  本机已自动探测到游戏 API: ${chalk.cyan(resolvedApiBase)}（~/.spark.json 里仍是 ${normalizeApiBase(config.apiBase)}，可 spark config --api-base 改成固定端口）\n`
      )
    );
  }

  console.log(chalk.bold.cyan("\n  spark — Game Generator\n"));
  console.log(chalk.dim("  输入游戏描述开始创建，Ctrl+C 退出\n"));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    history: loadSparkInputHistory(),
    historySize: SPARK_INPUT_HISTORY_MAX,
    removeHistoryDuplicates: true,
  });

  const prompt = () => {
    rl.question("> ", async (input) => {
      input = input.trim();
      if (!input) {
        prompt();
        return;
      }

      appendSparkInputHistory(input);
      messages.push({ role: "user", content: input });

      const spinner = ora({ text: "思考中...", color: "cyan" }).start();

      try {
        const context = collectLocalContext(cwd);
        const assistantText = await streamResponse(
          chatConfig,
          messages,
          context,
          cwd,
          spinner,
          () => {
            // on file written - ensure preview server running
            if (!previewServer) {
              previewServer = startPreviewServer(cwd);
              console.log(
                chalk.dim(
                  `  预览服务已启动: http://localhost:${previewServer.port}/spark（左侧可编辑保存，右侧运行）`
                )
              );
            }
            if (!previewOpened) {
              previewOpened = true;
              open(
                `http://localhost:${previewServer!.port}/spark`
              ).catch(() => {});
            }
          }
        );

        if (assistantText) {
          messages.push({ role: "assistant", content: assistantText });
        }

        if (chatConfig.token?.trim()) {
          const snap = await pushSparkSnapshot(chatConfig, cwd);
          if (!snap.ok) {
            console.log(chalk.dim(`  快照未同步: ${snap.error}`));
          }
        }
      } catch (err) {
        spinner.stop();
        console.error(
          chalk.red(
            `\n  错误: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }

      console.log(); // blank line
      prompt();
    });
  };

  rl.on("close", () => {
    previewServer?.close();
    console.log(chalk.dim("\n  再见!"));
    process.exit(0);
  });

  prompt();
}

function gameApiUrl(apiBase: string): string {
  return `${normalizeApiBase(apiBase)}/api/game`;
}

async function streamResponse(
  config: AppConfig,
  messages: Message[],
  context: FileContext,
  cwd: string,
  spinner: ReturnType<typeof ora>,
  onFileWritten: () => void
): Promise<string> {
  const url = gameApiUrl(config.apiBase);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.token ? { Cookie: `qm_session=${config.token}` } : {}),
    },
    body: JSON.stringify({ messages, context }),
  });

  if (!res.ok) {
    const text = await res.text();
    const isHtml =
      text.startsWith("<!DOCTYPE") ||
      text.startsWith("<html") ||
      text.includes("<!DOCTYPE html");
    const preview = isHtml ? `${text.slice(0, 280).replace(/\s+/g, " ")}…` : text;
    const hint404 =
      res.status === 404
        ? "\n\n提示: 当前服务上没有 /api/game。请检查：\n" +
          "  1) 在 ai-sql-demo 根目录运行 npm run dev，端口与下面一致\n" +
          `  2) spark config --api-base ${normalizeApiBase(config.apiBase)}（或改成 dev 实际端口）\n` +
          `  3) 确认本仓库存在 src/app/api/game/route.ts\n`
        : "";
    throw new Error(`API 返回 ${res.status}（${url}）: ${preview}${hint404}`);
  }

  if (!res.body) throw new Error("无响应流");

  spinner.stop();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  /** tool_call 流式参数片段，在 9 完整包到达前累加 */
  let toolArgsTextBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      const parsed = parseDataStreamLine(line);
      if (!parsed) continue;

      switch (parsed.type) {
        case "0": {
          const text = parsed.value as string;
          process.stdout.write(text);
          assistantText += text;
          break;
        }

        case "3": {
          console.error(chalk.red(`  流错误: ${parsed.value}`));
          break;
        }

        case "b": {
          // tool_call_streaming_start
          toolArgsTextBuffer = "";
          break;
        }

        case "c": {
          const data = parsed.value as { argsTextDelta?: string };
          toolArgsTextBuffer += data.argsTextDelta ?? "";
          break;
        }

        case "9": {
          // tool_call（完整一次调用）
          const data = parsed.value as {
            toolCallId: string;
            toolName: string;
            args: Record<string, unknown>;
          };
          const toolName = data.toolName;
          let raw = data.args as Record<string, string> | undefined;
          if (
            (!raw || Object.keys(raw).length === 0) &&
            toolArgsTextBuffer.trim()
          ) {
            try {
              raw = JSON.parse(toolArgsTextBuffer) as Record<string, string>;
            } catch {
              raw = raw ?? {};
            }
          }
          toolArgsTextBuffer = "";

          const args: Record<string, string> = {};
          if (raw) {
            for (const [k, v] of Object.entries(raw)) {
              args[k] = typeof v === "string" ? v : String(v);
            }
          }

          const result = await executeTool({ tool: toolName, args }, cwd);

          if (result.success) {
            console.log(chalk.green(`  ✓ ${result.message || toolName}`));
            if (toolName === "write_file") {
              onFileWritten();
            }
          } else {
            console.log(chalk.red(`  ✗ ${result.error}`));
          }
          break;
        }

        case "a": {
          // tool_result（服务端执行结果；本 CLI 在本地执行，可忽略）
          break;
        }

        case "d": {
          // finish_message
          break;
        }

        case "e": {
          // finish_step
          break;
        }
      }
    }
  }

  return assistantText;
}
