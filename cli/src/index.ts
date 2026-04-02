#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import readline from "node:readline";
import { loadConfig, saveConfig } from "./config.js";
import { startChat } from "./chat.js";
import { pushSparkSnapshot } from "./snapshot.js";

const program = new Command();

program
  .name("spark")
  .description("AI-powered game code generator")
  .version("0.1.0");

program
  .command("game")
  .description("进入游戏生成对话模式")
  .option("-p, --port <port>", "预览服务端口", "4321")
  .action(async () => {
    const config = loadConfig();
    if (!config.token) {
      console.log(
        chalk.yellow(
          "  提示: 尚未登录。运行 spark login 设置 token，或使用 --api-base 连接本地服务。\n"
        )
      );
    }
    await startChat(config, process.cwd());
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
  .description("将当前目录游戏文件快照推送到 Supabase（需登录 token）")
  .option("-s, --slug <slug>", "快照标识", "default")
  .action(async (opts: { slug?: string }) => {
    const config = loadConfig();
    const slug = (opts.slug || "default").trim() || "default";
    const r = await pushSparkSnapshot(config, process.cwd(), slug);
    if (r.ok) {
      console.log(chalk.green(`✓ 已推送快照 slug=${slug}`));
    } else {
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
    console.log(
      `  Token:    ${config.token ? chalk.green("已设置") : chalk.yellow("未设置")}`
    );
    console.log();
  });

program.parse();
