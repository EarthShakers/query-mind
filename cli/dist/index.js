#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import readline from "node:readline";
import path from "node:path";
import { loadConfig, saveConfig } from "./config.js";
import { startChat } from "./chat.js";
import { pushSparkSnapshot } from "./snapshot.js";
import { startPreviewServer } from "./preview.js";
import { probeSparkPreviewShell } from "./preview-probe.js";
import { ensureGameRoot, normalizeGameSlug, resolveGameRoot, GAMES_PARENT_DIR, listExistingGameSlugs, } from "./game-root.js";
const program = new Command();
async function chooseGameSlug(workspaceRoot) {
    const games = listExistingGameSlugs(workspaceRoot);
    if (games.length === 0) {
        return "default";
    }
    console.log(chalk.bold("\n  请选择要进入的游戏：\n"));
    games.forEach((slug, index) => {
        console.log(`  ${index + 1}. ${slug}`);
    });
    console.log();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return await new Promise((resolve) => {
        rl.question("请输入编号或 slug（回车默认 1）: ", (answer) => {
            rl.close();
            const raw = answer.trim();
            if (!raw) {
                resolve(games[0]);
                return;
            }
            const num = Number.parseInt(raw, 10);
            if (Number.isFinite(num) && num >= 1 && num <= games.length) {
                resolve(games[num - 1]);
                return;
            }
            resolve(normalizeGameSlug(raw));
        });
    });
}
program
    .name("spark")
    .description("AI-powered game code generator")
    .version("0.1.0")
    .addHelpText("after", `
示例:
  spark game
  spark game memory-card
  spark game -g flappy-bird
  spark preview -g memory-card -p 4321
  spark push -g tank-battle -s tank-battle-v1
  spark config --show

说明:
  - 每个游戏默认位于 ./${GAMES_PARENT_DIR}/<slug>/
  - 每个游戏目录里都有自己的 index.html
  - /spark 预览页支持切换不同 slug 的游戏
`);
program
    .command("game")
    .description(`进入游戏生成对话模式（文件写入 ./${GAMES_PARENT_DIR}/<游戏名>/）`)
    .argument("[game]", "直接指定游戏 slug，例如 memory-card")
    .option("-p, --port <port>", "预览服务端口（与 spark preview 一致）", "4321")
    .option("-g, --game <slug>", `游戏子目录名（位于 ./${GAMES_PARENT_DIR}/<slug>）`)
    .addHelpText("after", `
示例:
  spark game
  spark game memory-card
  spark game -g flappy-bird
  spark game -g pool -p 4322

提示:
  - spark game memory-card：直接进入已有游戏
  - 不传参数时，会自动列出 ./${GAMES_PARENT_DIR}/ 下现有游戏供你选择
  - 建议每个游戏使用独立 slug，便于在 /spark 中切换
`)
    .action(async (gameArg, opts) => {
    const config = loadConfig();
    if (!config.token) {
        console.log(chalk.yellow("  提示: 尚未登录。运行 spark login 设置 token，或使用 --api-base 连接本地服务。\n"));
    }
    const p = Number.parseInt(String(opts.port ?? "4321"), 10);
    const previewPort = Number.isFinite(p) && p > 0 && p < 65536 ? p : 4321;
    const workspaceRoot = process.cwd();
    const gameSlug = opts.game?.trim()
        ? normalizeGameSlug(String(opts.game))
        : gameArg?.trim()
            ? normalizeGameSlug(gameArg)
            : await chooseGameSlug(workspaceRoot);
    await startChat(config, process.cwd(), { previewPort, gameSlug });
});
program
    .command("preview")
    .description("单独启动本地预览（可与 game 分终端运行；重启预览只需 Ctrl+C 后再 preview，不结束对话）")
    .argument("[workspace]", "工作区根目录（其下为 games/<游戏名>）", ".")
    .option("-p, --port <port>", "端口", "4321")
    .option("-g, --game <slug>", `游戏子目录名（预览 ./${GAMES_PARENT_DIR}/<slug>）`, "default")
    .addHelpText("after", `
示例:
  spark preview
  spark preview -g memory-card
  spark preview -g memory-card -p 4321
  spark preview . -g tank-battle -p 4322

提示:
  - 打开后访问 http://localhost:<port>/spark
  - /spark 顶部可以切换 games/ 下的多个游戏目录
`)
    .action(async (workspace, opts) => {
    const workspaceRoot = path.resolve(process.cwd(), workspace || ".");
    const gameSlug = normalizeGameSlug(String(opts.game ?? "default"));
    const gameDir = resolveGameRoot(workspaceRoot, gameSlug);
    ensureGameRoot(gameDir);
    const p = Number.parseInt(String(opts.port ?? "4321"), 10);
    const port = Number.isFinite(p) && p > 0 && p < 65536 ? p : 4321;
    if (await probeSparkPreviewShell(port)) {
        console.log(chalk.yellow(`\n  端口 ${port} 上已有 spark 预览在运行，无需重复启动。\n` +
            `  打开: ${chalk.cyan.underline(`http://localhost:${port}/spark`)}\n`));
        console.log(chalk.dim("  若需为本游戏单独起服务，请先停掉占用该端口的进程，或使用：spark preview -p 4322\n"));
        process.exit(0);
    }
    const srv = startPreviewServer(gameDir, port);
    console.log(chalk.green(`\n  预览: http://localhost:${srv.port}/spark  游戏目录: ${gameDir}\n`));
    console.log(chalk.dim("  Ctrl+C 停止本预览；另一终端的 spark game 可继续使用（会先探测本服务）\n"));
    const shutdown = () => {
        srv.close();
        console.log(chalk.dim("\n  预览已停止"));
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
});
program
    .command("login")
    .description("设置认证 token")
    .addHelpText("after", `
说明:
  - 登录 token 会保存到本地配置
  - 本地开发只跑 game/preview 时通常不一定需要登录
`)
    .action(async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question("请输入 token: ", (token) => {
        token = token.trim();
        if (!token) {
            console.log(chalk.red("token 不能为空"));
            rl.close();
            return;
        }
        saveConfig({ token });
        console.log(chalk.green("✓ token 已保存"));
        rl.close();
    });
});
program
    .command("push")
    .description(`将 ./${GAMES_PARENT_DIR}/<游戏名> 快照推送到 Supabase（需登录 token）`)
    .argument("[workspace]", "工作区根目录", ".")
    .option("-g, --game <slug>", `游戏子目录名（推送 ./${GAMES_PARENT_DIR}/<slug>）`, "default")
    .option("-s, --slug <slug>", "云端快照 slug（与本地游戏名无关）", "default")
    .addHelpText("after", `
示例:
  spark push -g flappy-bird
  spark push -g tank-battle -s tank-battle-v2
`)
    .action(async (workspace, opts) => {
    const config = loadConfig();
    const remoteSlug = (opts.slug || "default").trim() || "default";
    const workspaceRoot = path.resolve(process.cwd(), workspace || ".");
    const gameSlug = normalizeGameSlug(String(opts.game ?? "default"));
    const gameDir = resolveGameRoot(workspaceRoot, gameSlug);
    const r = await pushSparkSnapshot(config, gameDir, remoteSlug);
    if (r.ok) {
        console.log(chalk.green(`✓ 已推送游戏 ${gameSlug} → 云端 slug=${remoteSlug}`));
    }
    else {
        console.log(chalk.red(`✗ ${r.error}`));
        process.exitCode = 1;
    }
});
program
    .command("config")
    .description("查看或修改配置")
    .option("--api-base <url>", "设置 API 地址")
    .option("--show", "显示当前配置")
    .addHelpText("after", `
示例:
  spark config --show
  spark config --api-base http://localhost:3000
`)
    .action((opts) => {
    if (opts.apiBase) {
        saveConfig({ apiBase: opts.apiBase });
        console.log(chalk.green(`✓ API 地址已设置为: ${opts.apiBase}`));
        return;
    }
    const config = loadConfig();
    console.log(chalk.bold("\n  spark 配置:\n"));
    console.log(`  API 地址: ${chalk.cyan(config.apiBase)}`);
    console.log(`  Token:    ${config.token ? chalk.green("已设置") : chalk.yellow("未设置")}`);
    console.log();
});
program.parse();
