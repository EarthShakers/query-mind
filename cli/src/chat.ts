import chalk from "chalk";
import ora from "ora";
import readline from "node:readline";
import path from "node:path";
import { normalizeApiBase, type AppConfig } from "./config.js";
import {
  ensureGameRoot,
  GAMES_PARENT_DIR,
  normalizeGameSlug,
  resolveGameRoot,
} from "./game-root.js";
import { resolveLocalGameApiBase } from "./discover.js";
import type { FileContext } from "./context.js";
import { collectLocalContext } from "./context.js";
import { executeTool } from "./tools.js";
import { startPreviewServer, type PreviewServer } from "./preview.js";
import {
  probeSparkPreviewShell,
  fetchSparkPreviewGameRoot,
} from "./preview-probe.js";
import { findFreeLocalPort, isLocalPortFree } from "./preview-port.js";
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

interface StreamToolExecution {
  toolName: string;
  args: Record<string, string>;
  result: Awaited<ReturnType<typeof executeTool>>;
}

interface StreamResponseResult {
  assistantText: string;
  toolExecutions: StreamToolExecution[];
}

interface StreamingToolProgress {
  toolName: string;
  argsText: string;
  lastAnnouncedAt: number;
  lastAnnouncedSize: number;
  lastDraftPublishedAt: number;
  lastDraftPublishedSize: number;
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

export interface StartChatOptions {
  /** 预览 HTTP 端口；与 `spark preview -p` 一致 */
  previewPort?: number;
  /** 游戏子目录名，根目录为 <workspace>/games/<slug> */
  gameSlug?: string;
}

export async function startChat(
  config: AppConfig,
  workspaceRoot: string,
  options: StartChatOptions = {}
): Promise<void> {
  const workspace = path.resolve(workspaceRoot);
  const gameSlug = normalizeGameSlug(options.gameSlug ?? "default");
  const gameRoot = resolveGameRoot(workspace, gameSlug);
  ensureGameRoot(gameRoot);

  const messages: Message[] = [];
  let previewServer: PreviewServer | null = null;
  /** 非 null 表示已可用预览（内嵌或独立进程） */
  let activePreviewPort: number | null = null;
  /** true：预览由另一终端 `spark preview` 提供，退出对话时不要 close */
  let previewExternal = false;
  let previewOpened = false;
  const previewPort = options.previewPort ?? 4321;
  let previewSetupPromise: Promise<number> | null = null;
  let pendingDraft:
    | { path: string; content: string; note?: string }
    | null = null;

  async function revealPreview(file = "index.html"): Promise<void> {
    try {
      const port = await ensurePreview();
      if (!previewOpened) {
        previewOpened = true;
        await open(
          `http://localhost:${port}/spark?file=${encodeURIComponent(file)}&t=${Date.now()}`
        );
      }
    } catch (e) {
      console.error(
        chalk.red(
          `\n  预览启动失败: ${e instanceof Error ? e.message : String(e)}`
        )
      );
    }
  }

  function ensurePreview(): Promise<number> {
    if (activePreviewPort !== null) {
      return Promise.resolve(activePreviewPort);
    }
    if (!previewSetupPromise) {
      previewSetupPromise = (async () => {
        const wantRoot = path.resolve(gameRoot);

        if (await probeSparkPreviewShell(previewPort)) {
          const remoteRaw = await fetchSparkPreviewGameRoot(previewPort);
          if (remoteRaw !== null) {
            const remoteRoot = path.resolve(remoteRaw);
            if (remoteRoot === wantRoot) {
              previewExternal = true;
              activePreviewPort = previewPort;
              console.log(
                chalk.dim(
                  `  使用独立预览服务: http://localhost:${previewPort}/spark`
                )
              );
              return activePreviewPort;
            }
            console.log(
              chalk.yellow(
                `\n  警告: 端口 ${previewPort} 上已有预览，但游戏根目录不一致：\n` +
                  `    已有预览: ${remoteRoot}\n` +
                  `    当前游戏: ${wantRoot}\n` +
                  "  常见原因: 在别的目录执行过 spark preview。将为本游戏另开端口启动预览。\n"
              )
            );
          } else {
            previewExternal = true;
            activePreviewPort = previewPort;
            console.log(
              chalk.dim(
                `  使用独立预览服务: http://localhost:${previewPort}/spark`
              )
            );
            console.log(
              chalk.dim(
                "  （对方未返回 /__spark/meta，若 iframe 与编辑器不一致请升级 spark 并统一工作目录）\n"
              )
            );
            return activePreviewPort;
          }
        }

        let bindPort = previewPort;
        if (!(await isLocalPortFree(bindPort))) {
          const alt = await findFreeLocalPort(
            previewPort + 1,
            previewPort + 40
          );
          if (alt != null) {
            bindPort = alt;
            console.log(
              chalk.dim(
                `  端口 ${previewPort} 已被占用，已改用 ${bindPort} 启动预览`
              )
            );
          }
        }

        previewServer = startPreviewServer(gameRoot, bindPort);
        if (pendingDraft) {
          previewServer.setDraft(pendingDraft);
        }
        activePreviewPort = previewServer.port;
        console.log(
          chalk.dim(
            `  预览服务已启动: http://localhost:${activePreviewPort}/spark（左侧可编辑保存，右侧运行）`
          )
        );
        return activePreviewPort!;
      })();
    }
    return previewSetupPromise;
  }

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
  console.log(
    chalk.dim(
      `  游戏目录: ${chalk.cyan(gameRoot)}\n` +
        `  （工作区 ${GAMES_PARENT_DIR}/${gameSlug}）\n\n` +
        "  输入游戏描述开始创建，Ctrl+C 退出\n" +
        "  另开终端运行 " +
        chalk.cyan(
          `spark preview -g ${gameSlug} -p ${previewPort}`
        ) +
        " 可单独重启预览，不结束本对话\n"
    )
  );

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

      // 必须与 readline 共用 stdin：ora 默认 discardStdin 会在部分终端里搞坏 stdin，导致对话静默退出
      const spinner = ora({
        text: "正在规划游戏实现...",
        color: "cyan",
        discardStdin: false,
      }).start();

      // 生成期间暂停 readline，避免与流式输出争抢 stdin（否则会表现为卡住、只剩 >、或偶发无输出）
      rl.pause();

      try {
        const context = collectLocalContext(gameRoot);
        let autoRounds = 0;
        while (true) {
          const phaseLabel =
            autoRounds === 0
              ? "正在规划游戏实现..."
              : "正在根据已读取文件修改代码...";
          if (!spinner.isSpinning) {
            spinner.start(phaseLabel);
          } else {
            spinner.text = phaseLabel;
          }

          let firstVisibleInRound = false;
          const roundStartedAt = Date.now();
          const spinnerHeartbeat = setInterval(() => {
            if (firstVisibleInRound || !spinner.isSpinning) return;
            const seconds = Math.max(
              1,
              Math.floor((Date.now() - roundStartedAt) / 1000)
            );
            spinner.text =
              autoRounds === 0
                ? `正在规划游戏实现... ${seconds}s`
                : `正在根据已读取文件修改代码... ${seconds}s`;
          }, 1000);

          let previewTriggeredThisRound = false;
          let assistantText = "";
          let toolExecutions: StreamToolExecution[] = [];
          try {
            ({ assistantText, toolExecutions } = await streamResponse(
              chatConfig,
              messages,
              context,
              gameRoot,
              () => {
                firstVisibleInRound = true;
                spinner.stop();
                if (autoRounds === 0) {
                  pendingDraft = {
                    path: "index.html",
                    content:
                      "<!-- 正在等待模型开始生成代码。\n" +
                      "计划已经输出，下一步会读取或写入文件。\n" +
                      "如果左侧还没出现正式草稿，说明模型还在组织接下来的工具调用。 -->\n",
                    note: "计划已生成，正在等待开始写代码...",
                  };
                  previewServer?.setDraft(pendingDraft);
                  void revealPreview("index.html");
                }
              },
              async () => {
                if (previewTriggeredThisRound) return;
                previewTriggeredThisRound = true;
                pendingDraft = null;
                previewServer?.setDraft(null);
                await revealPreview("index.html");
              },
              (draft) => {
                pendingDraft = draft;
                if (draft && !activePreviewPort) {
                  void revealPreview(draft.path);
                }
                previewServer?.setDraft(draft);
              }
            ));
          } finally {
            clearInterval(spinnerHeartbeat);
          }

          if (assistantText) {
            messages.push({ role: "assistant", content: assistantText });
          }

          if (toolExecutions.length === 0) {
            break;
          }

          const hasSuccessfulWrite = toolExecutions.some(
            (item) => item.toolName === "write_file" && item.result.success
          );
          if (hasSuccessfulWrite) {
            const writeMessages = toolExecutions
              .filter(
                (item) => item.toolName === "write_file" && item.result.success
              )
              .map((item) => item.result.message)
              .filter(Boolean);
            console.log(
              chalk.green(
                `\n  已完成代码生成${writeMessages.length ? `：${writeMessages.join("，")}` : ""}`
              )
            );
            break;
          }

          autoRounds += 1;
          if (autoRounds >= 4) {
            console.log(
              chalk.yellow(
                "\n  工具调用轮次过多，已停止自动续跑。你可以继续描述下一步需求。\n"
              )
            );
            break;
          }

          messages.push({
            role: "user",
            content: buildToolFeedbackMessage(toolExecutions),
          });
          const readCount = toolExecutions.filter(
            (item) => item.toolName === "read_file" && item.result.success
          ).length;
          const writeCount = toolExecutions.filter(
            (item) => item.toolName === "write_file" && item.result.success
          ).length;
          const summary =
            writeCount > 0
              ? `已写入 ${writeCount} 个文件，正在整理最后结果...`
              : readCount > 0
                ? `已读取 ${readCount} 个文件，正在根据现有代码继续修改...`
                : "本地工具已执行，正在继续生成...";
          console.log(chalk.dim(`\n  ${summary}\n`));
        }

        if (chatConfig.token?.trim()) {
          const snap = await pushSparkSnapshot(chatConfig, gameRoot);
          if (!snap.ok) {
            console.log(chalk.dim(`  快照未同步: ${snap.error}`));
          }
        }
      } catch (err) {
        spinner.stop();
        const message =
          err instanceof Error ? normalizeCliStreamError(err) : String(err);
        console.error(
          chalk.red(
            `\n  错误: ${message}`
          )
        );
      } finally {
        spinner.stop();
        rl.resume();
      }

      console.log(); // blank line
      prompt();
    });
  };

  rl.on("close", () => {
    if (previewServer && !previewExternal) {
      previewServer.close();
    }
    console.log(chalk.dim("\n  再见!"));
    if (previewExternal) {
      console.log(
        chalk.dim(
          "  独立预览仍在运行；要停止请在该终端对 spark preview 按 Ctrl+C\n"
        )
      );
    }
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
  onFirstVisible: () => void,
  onFileWritten: () => void | Promise<void>,
  onDraftUpdate?: (draft: { path: string; content: string; note?: string } | null) => void
): Promise<StreamResponseResult> {
  const url = gameApiUrl(config.apiBase);
  /** 略长于服务端 300s abort，避免永远卡在「思考中」 */
  const streamTimeoutMs = 320_000;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.token ? { Cookie: `qm_session=${config.token}` } : {}),
      },
      body: JSON.stringify({ messages, context }),
      signal: AbortSignal.timeout(streamTimeoutMs),
    });
  } catch (err) {
    if ((err as Error)?.name === "TimeoutError") {
      throw new Error(
        "游戏生成超时。可以重试一次，或把需求拆小一点，例如先生成核心玩法，再继续让它美化。"
      );
    }
    throw err;
  }

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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  /** tool_call 流式参数片段，在 9 完整包到达前累加 */
  let toolArgsTextBuffer = "";
  const toolExecutions: StreamToolExecution[] = [];
  let firstVisibleEvent = false;
  let streamingTool: StreamingToolProgress | null = null;

  const ensureVisible = () => {
    if (firstVisibleEvent) return;
    firstVisibleEvent = true;
    onFirstVisible();
    process.stdout.write("\n");
  };

  const tryExtractToolPath = (argsText: string): string | null => {
    const match = argsText.match(/"path"\s*:\s*"([^"]*)/);
    return match?.[1] ?? null;
  };

  const decodePartialJsonString = (raw: string): string => {
    let text = raw;
    if (text.endsWith("\\")) {
      text = text.slice(0, -1);
    }
    text = text.replace(/\\"/g, '"');
    text = text.replace(/\\\\/g, "\\");
    text = text.replace(/\\n/g, "\n");
    text = text.replace(/\\r/g, "\r");
    text = text.replace(/\\t/g, "\t");
    return text;
  };

  const tryExtractPartialContent = (argsText: string): string | null => {
    const marker = '"content":"';
    const markerIdx = argsText.indexOf(marker);
    if (markerIdx < 0) return null;
    let raw = argsText.slice(markerIdx + marker.length);
    const closingIdx = raw.lastIndexOf('"');
    if (closingIdx >= 0) {
      raw = raw.slice(0, closingIdx);
    }
    return decodePartialJsonString(raw);
  };

  const describeDraftPhase = (content: string): string | null => {
    const lower = content.toLowerCase();
    if (lower.includes("level") || lower.includes("关卡")) {
      return "关卡逻辑";
    }
    if (lower.includes("settings") || lower.includes("panel") || lower.includes("参数")) {
      return "参数面板";
    }
    if (lower.includes("particle") || lower.includes("粒子")) {
      return "特效";
    }
    if (lower.includes("<style") || lower.includes(":root") || lower.includes("background")) {
      return "界面样式";
    }
    if (lower.includes("canvas") || lower.includes("render") || lower.includes("draw")) {
      return "渲染循环";
    }
    return null;
  };

  const publishDraftPreview = (force = false) => {
    if (!streamingTool || streamingTool.toolName !== "write_file" || !onDraftUpdate) {
      return;
    }
    const path = tryExtractToolPath(streamingTool.argsText);
    const partialContent = tryExtractPartialContent(streamingTool.argsText);
    if (!path || partialContent == null) return;

    const now = Date.now();
    const size = partialContent.length;
    if (
      !force &&
      now - streamingTool.lastDraftPublishedAt < 120 &&
      size - streamingTool.lastDraftPublishedSize < 256
    ) {
      return;
    }

    const lineCount = Math.max(1, partialContent.split("\n").length);
    const phase = describeDraftPhase(partialContent);
    onDraftUpdate({
      path,
      content: partialContent,
      note:
        `正在生成草稿` +
        `${lineCount ? `，约 ${lineCount} 行` : ""}` +
        `${phase ? `，当前在补 ${phase}` : ""}`,
    });

    streamingTool.lastDraftPublishedAt = now;
    streamingTool.lastDraftPublishedSize = size;
  };

  const announceStreamingToolProgress = (force = false) => {
    if (!streamingTool) return;
    const now = Date.now();
    const size = streamingTool.argsText.length;
    if (
      !force &&
      now - streamingTool.lastAnnouncedAt < 1200 &&
      size - streamingTool.lastAnnouncedSize < 8192
    ) {
      return;
    }

    const path = tryExtractToolPath(streamingTool.argsText);
    if (streamingTool.toolName === "write_file") {
      const partialContent = tryExtractPartialContent(streamingTool.argsText);
      const lineCount = partialContent
        ? Math.max(1, partialContent.split("\n").length)
        : null;
      const phase = partialContent ? describeDraftPhase(partialContent) : null;
      console.log(
        chalk.dim(
          `  正在编写${path ? ` ${path}` : "代码文件"}...` +
            `${lineCount ? ` 草稿约 ${lineCount} 行` : ""}` +
            `${phase ? `，当前在补 ${phase}` : ""}`
        )
      );
    } else if (streamingTool.toolName === "read_file") {
      console.log(
        chalk.dim(`  正在读取${path ? ` ${path}` : "项目文件"}...`)
      );
    } else {
      console.log(chalk.dim(`  正在执行 ${streamingTool.toolName}...`));
    }

    streamingTool.lastAnnouncedAt = now;
    streamingTool.lastAnnouncedSize = size;
  };

  try {
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
            ensureVisible();
            const text = parsed.value as string;
            process.stdout.write(text);
            assistantText += text;
            break;
          }

          case "3": {
            ensureVisible();
            console.error(chalk.red(`  流错误: ${parsed.value}`));
            break;
          }

          case "b": {
            // tool_call_streaming_start
            toolArgsTextBuffer = "";
            const data = parsed.value as {
              toolName?: string;
            };
            streamingTool = {
              toolName: data.toolName ?? "tool_call",
              argsText: "",
              lastAnnouncedAt: 0,
              lastAnnouncedSize: 0,
              lastDraftPublishedAt: 0,
              lastDraftPublishedSize: 0,
            };
            ensureVisible();
            announceStreamingToolProgress(true);
            break;
          }

          case "c": {
            const data = parsed.value as { argsTextDelta?: string };
            toolArgsTextBuffer += data.argsTextDelta ?? "";
            if (streamingTool) {
              streamingTool.argsText += data.argsTextDelta ?? "";
              publishDraftPreview();
              announceStreamingToolProgress();
            }
            break;
          }

          case "9": {
            ensureVisible();
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
            publishDraftPreview(true);
            announceStreamingToolProgress(true);
            streamingTool = null;

            const args: Record<string, string> = {};
            if (raw) {
              for (const [k, v] of Object.entries(raw)) {
                args[k] = typeof v === "string" ? v : String(v);
              }
            }

            const result = await executeTool({ tool: toolName, args }, cwd);
            toolExecutions.push({ toolName, args, result });

            if (result.success) {
              console.log(chalk.green(`  ✓ ${result.message || toolName}`));
              if (toolName === "write_file") {
                onDraftUpdate?.(null);
                await onFileWritten();
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
  } catch (err) {
    onDraftUpdate?.(null);
    if (
      (assistantText.trim() || toolExecutions.length > 0) &&
      err instanceof Error &&
      /terminated|aborted/i.test(err.message)
    ) {
      return { assistantText, toolExecutions };
    }
    throw err;
  }

  onDraftUpdate?.(null);
  return { assistantText, toolExecutions };
}

function buildToolFeedbackMessage(
  toolExecutions: StreamToolExecution[]
): string {
  const details = toolExecutions
    .map(({ toolName, args, result }, index) => {
      const path = args.path ? ` path=${args.path}` : "";
      if (result.success) {
        if (toolName === "read_file") {
          const content = (result.content ?? "").slice(0, 24_000);
          return `${index + 1}. ${toolName}${path}: 成功\n文件内容如下：\n\`\`\`\n${content}\n\`\`\``;
        }
        return `${index + 1}. ${toolName}${path}: 成功${result.message ? `（${result.message}）` : ""}`;
      }
      return `${index + 1}. ${toolName}${path}: 失败（${result.error || "未知错误"}）`;
    })
    .join("\n\n");

  return [
    "系统自动反馈：以下是你刚才请求的本地工具执行结果，请基于这些结果继续。",
    "不要假设工具尚未执行；成功的步骤不要重复调用，除非确实需要再次修改。",
    "在你继续调用下一个工具之前，先用一句简短中文说明你准备修改什么，让用户能看到进度，但不要输出详细推理。",
    "如果游戏已经可运行，请直接给出简短完成说明；如果还要继续修改，请继续调用工具。",
    "",
    details,
  ].join("\n");
}

function normalizeCliStreamError(err: Error): string {
  if (/terminated/i.test(err.message)) {
    return "连接在生成过程中中断了。通常是服务端超时或模型提前断开，可以重试一次。";
  }
  if (/aborted due to timeout|timeout/i.test(err.message)) {
    return "生成超时了。建议先让它完成核心玩法，再继续细化美术、参数面板和多关卡。";
  }
  return err.message;
}
