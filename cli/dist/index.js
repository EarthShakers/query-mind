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
import { ensureGameRoot, normalizeGameSlug, resolveGameRoot, GAMES_PARENT_DIR, } from "./game-root.js";
const program = new Command();
program
    .name("spark")
    .description("AI-powered game code generator")
    .version("0.1.0");
program
    .command("game")
    .description(`进入游戏生成对话模式（文件写入 ./${GAMES_PARENT_DIR}/<游戏名>/）`)
    .option("-p, --port <port>", "预览服务端口（与 spark preview 一致）", "4321")
    .option("-g, --game <slug>", `游戏子目录名（位于 ./${GAMES_PARENT_DIR}/<slug>）`, "default")
    .action(async (opts) => {
    const config = loadConfig();
    if (!config.token) {
        console.log(chalk.yellow("  提示: 尚未登录。运行 spark login 设置 token，或使用 --api-base 连接本地服务。\n"));
    }
    const p = Number.parseInt(String(opts.port ?? "4321"), 10);
    const previewPort = Number.isFinite(p) && p > 0 && p < 65536 ? p : 4321;
    const gameSlug = normalizeGameSlug(String(opts.game ?? "default"));
    await startChat(config, process.cwd(), { previewPort, gameSlug });
});
program
    .command("preview")
    .description("单独启动本地预览（可与 game 分终端运行；重启预览只需 Ctrl+C 后再 preview，不结束对话）")
    .argument("[workspace]", "工作区根目录（其下为 games/<游戏名>）", ".")
    .option("-p, --port <port>", "端口", "4321")
    .option("-g, --game <slug>", `游戏子目录名（预览 ./${GAMES_PARENT_DIR}/<slug>）`, "default")
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
