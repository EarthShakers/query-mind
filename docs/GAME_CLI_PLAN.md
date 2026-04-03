# AI Game Generator - 技术方案 (最终版)

> CLI 对话生成游戏代码 + 浏览器实时预览

---

## 0. 产品命名

CLI 命令与 npm 包统一为 **`spark`**（全局安装后可执行 `spark game` / `spark login` / `spark config`）。

配置文件：`~/.spark.json`（实现上仍会尝试读取旧版 `~/.sparkcraft.json` 以兼容迁移）。

---

## 1. 产品形态

```
终端 (CLI)                              浏览器 (自动打开)
┌──────────────────────────┐           ┌──────────────────────────┐
│ $ spark game             │           │                          │
│                          │           │  ┌─Code──┐ ┌─Preview──┐ │
│ > 做一个贪吃蛇游戏        │──SSE───→  │  │<html> │ │  🐍      │ │
│                          │           │  │<canvas│ │  Score:3 │ │
│ 📋 Plan:                 │           │  │...    │ │          │ │
│  - 创建 index.html       │           │  └───────┘ └──────────┘ │
│  - 内联 Canvas 游戏逻辑   │           │                          │
│ 确认执行? [Y/n] █        │           │   ← WebSocket 热更新     │
│                          │           │                          │
│ ✓ 已写入 game/index.html │           │  [代码预览]  [游戏运行]   │
│ ✓ 浏览器已刷新            │           │                          │
│                          │           │                          │
│ > 加个计分系统和音效       │──SSE───→  │  (实时刷新)              │
│ ...                      │           │                          │
└──────────────────────────┘           └──────────────────────────┘
```

**当前实现（MVP）**：预览服务在写入文件后启动，浏览器默认打开 **`http://localhost:<端口>/spark`** — 左侧为 **Ace 编辑器**（可改、**Ctrl+S / 按钮保存**，`POST /__spark/save` 写回项目目录，扩展名白名单），右侧 **iframe 运行游戏**；`?file=相对路径` 可编辑其它文件（如 `game.js`）。外部/CLI 写入触发 WebSocket 时，若本地有未保存修改会 **confirm** 再覆盖。`/index.html` 仍可单独打开（带热更新）。「Plan 确认」等仍属 Phase 2。

## 2. 整体架构

```
┌─ CLI (Node.js, npm 包) ─────────────────────────────────────┐
│                                                              │
│  ┌─ 对话循环 ─┐  ┌─ 文件操作 ─┐  ┌─ 预览服务 ──────────┐    │
│  │ SSE 流式   │  │ write_file │  │ static server      │    │
│  │ 终端渲染   │  │ read_file  │  │ WS 热更新           │    │
│  │ Plan 确认  │  │ 上下文收集  │  │ open(browser)      │    │
│  └─────┬──────┘  └─────┬──────┘  └──────┬──────────────┘    │
│        │               │                │                    │
│  ┌─ 配置模块 ───────────────────────────────────────────┐    │
│  │ auth token / api_base / model 配置 (~/.spark.json)     │    │
│  └──────────────────────────────────────────────────────┘    │
└────────┬─────────────────────────────────────────────────────┘
         │
         │  HTTP/SSE
         │  上行: messages + 本地文件上下文
         │  下行: streaming text + tool_calls
         │
┌────────▼─────────────────────────────────────────────────────┐
│  现有服务端 (Next.js)                                         │
│                                                              │
│  /api/game  ← 新增 (游戏 prompt + streamText + tools)        │
│  /api/chat  ← 现有 (知识对话 + RAG)                          │
│  认证 / 限流 / 模型管理  ← 现有, 无需改动                      │
└──────────────────────────────────────────────────────────────┘
```

### 架构决策

| 决策     | 选择              | 理由                                |
| -------- | ----------------- | ----------------------------------- |
| LLM 通信 | 经由 Web 服务端   | 复用 RAG/Agent/限流, API Key 安全   |
| 文件操作 | CLI 本地 fs       | 天然优势, 无沙箱限制                |
| 游戏预览 | CLI 起本地 server | 浏览器渲染, WS 热更新               |
| CLI 定位 | 薄客户端          | 服务端是 Brain, CLI 只做 I/O 和渲染 |

## 3. 从 Claude Code 源码借鉴的模式

> 分析了 https://github.com/sanbuphy/claude-code-source-code
> Claude Code 有 700+ 文件, 深度绑定 Anthropic 内部基础设施。
> 以下只提炼对我们有用的模式, 不照搬复杂度。

### 3.1 Tool 定义模式 (借鉴)

Claude Code 用 `buildTool()` 统一定义工具, 每个工具包含 schema + call + permission:

```typescript
// 我们的简化版本 — 只保留核心
interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  call(args: any, ctx: ToolContext): Promise<ToolResult>;
  needsConfirm?(args: any): boolean; // 是否需要用户确认
}

// 注册工具
const tools: Tool[] = [writeFileTool, readFileTool, runCommandTool];
```

Claude Code 原版有 20+ 个字段 (permissions, LSP notify, analytics 等), 我们只要 5 个。

### 3.2 文件写入安全 (借鉴)

Claude Code 的 FileWriteTool 有一个好的安全模式:

- **写前必须先读**: 防止 LLM 凭空覆盖用户文件
- **时间戳校验**: 如果文件在读取后被外部修改, 拒绝写入

```typescript
// 简化实现
const fileReadTimestamps = new Map<string, number>();

function writeFile(path: string, content: string) {
  const lastRead = fileReadTimestamps.get(path);
  if (fs.existsSync(path) && !lastRead) {
    throw new Error("文件未被读取过, 请先读取再写入");
  }
  if (lastRead && fs.statSync(path).mtimeMs > lastRead) {
    throw new Error("文件已被外部修改, 请重新读取");
  }
  fs.writeFileSync(path, content, "utf-8");
  fileReadTimestamps.set(path, Date.now());
}
```

### 3.3 AsyncGenerator 流式输出 (借鉴)

Claude Code 的 QueryEngine 用 `async *submitMessage()` 生成器:

```typescript
// Claude Code 模式 (简化)
async function* chatStream(messages, context) {
  // SSE 连接到服务端
  const eventSource = new EventSource(`${API_BASE}/api/game`);

  for await (const event of eventSource) {
    if (event.type === "text") {
      yield { type: "text", content: event.data };
    }
    if (event.type === "tool_call") {
      // 本地执行工具
      const result = await executeTool(event.data);
      yield { type: "tool_result", ...result };
    }
    if (event.type === "done") break;
  }
}

// 终端消费
for await (const chunk of chatStream(messages, ctx)) {
  if (chunk.type === "text") process.stdout.write(chunk.content);
  if (chunk.type === "tool_result") renderToolResult(chunk);
}
```

### 3.4 不借鉴的部分

| Claude Code 特性           | 不采用原因           |
| -------------------------- | -------------------- |
| Bun bundler 绑定           | 我们用标准 Node.js   |
| 复杂权限系统 (6 层)        | 我们只需简单确认     |
| LSP 集成                   | 游戏生成不需要       |
| Feature flags / A-B test   | 产品初期不需要       |
| 内部 analytics / telemetry | 不适用               |
| OAuth + 企业 SSO           | 先用 JWT, 后续看需求 |
| Session persistence 700 行 | 我们对话历史存服务端 |

## 4. 核心模块设计

### 4.1 CLI 对话循环

```typescript
// cli/chat.ts — 核心对话循环 (~150行)
import { createInterface } from "readline";
import chalk from "chalk";

async function chatLoop(config: AppConfig) {
  const rl = createInterface({ input: process.stdin });
  const messages: Message[] = [];

  console.log(chalk.bold(`spark Game Generator`));
  console.log(chalk.dim("输入游戏描述开始创建, Ctrl+C 退出\n"));

  for await (const input of rl) {
    messages.push({ role: "user", content: input });

    // 收集本地文件上下文
    const context = await collectLocalContext(process.cwd());

    // 流式请求服务端
    for await (const chunk of streamRequest(config, messages, context)) {
      switch (chunk.type) {
        case "text":
          process.stdout.write(chunk.content);
          break;

        case "plan":
          // 展示计划, 等待确认
          renderPlan(chunk.files);
          if (!(await confirm("确认执行?"))) {
            messages.push({ role: "user", content: "用户取消了执行" });
            continue;
          }
          break;

        case "tool_call":
          const result = await executeTool(chunk, process.cwd());
          renderToolResult(result);
          break;
      }
    }

    console.log(); // 换行
  }
}
```

### 4.2 SSE 客户端

```typescript
// cli/stream.ts — SSE 流式接收 (~80行)
async function* streamRequest(
  config: AppConfig,
  messages: Message[],
  context: FileContext
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${config.apiBase}/api/game`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({ messages, context }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop()!; // 保留不完整的部分

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = JSON.parse(line.slice(6));
      yield data;
    }
  }
}
```

### 4.3 Tool 执行

```typescript
// cli/tools.ts — 本地工具执行 (~100行)
async function executeTool(
  toolCall: ToolCall,
  cwd: string
): Promise<ToolResult> {
  switch (toolCall.tool) {
    case "write_file": {
      const fullPath = path.resolve(cwd, toolCall.args.path);

      // 安全检查: 不允许写入 cwd 之外
      if (!fullPath.startsWith(cwd)) {
        return { error: "路径越界, 只能写入项目目录" };
      }

      // 确保目录存在
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, toolCall.args.content, "utf-8");

      return {
        success: true,
        message: `写入 ${toolCall.args.path} (${
          toolCall.args.content.split("\n").length
        }行)`,
      };
    }

    case "read_file": {
      const fullPath = path.resolve(cwd, toolCall.args.path);
      const content = await fs.readFile(fullPath, "utf-8");
      return { success: true, content };
    }

    case "run_command": {
      // 危险操作, 必须用户确认
      if (!(await confirm(`执行命令: ${toolCall.args.command}`))) {
        return { error: "用户拒绝执行" };
      }
      const { stdout, stderr } = await exec(toolCall.args.command, { cwd });
      return { success: true, stdout, stderr };
    }

    default:
      return { error: `未知工具: ${toolCall.tool}` };
  }
}
```

### 4.4 预览服务

```typescript
// cli/preview.ts — 本地预览 + 热更新 (~60行)
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { watch } from "chokidar";
import { lookup } from "mime-types";

function startPreviewServer(gameDir: string, port = 4321) {
  const server = createServer((req, res) => {
    const urlPath = req.url === "/" ? "/index.html" : req.url!;
    const filePath = path.join(gameDir, urlPath);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end("Not Found");
    }

    let content = fs.readFileSync(filePath);
    const mime = lookup(filePath) || "application/octet-stream";

    // HTML 文件注入热更新脚本
    if (filePath.endsWith(".html")) {
      const hmrScript = `<script>
        new WebSocket("ws://localhost:${port}")
          .onmessage = () => location.reload();
      </script>`;
      content = Buffer.from(
        content.toString().replace("</body>", hmrScript + "</body>")
      );
    }

    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  });

  const wss = new WebSocketServer({ server });

  // 防抖: 批量写入时只刷新一次
  let debounceTimer: NodeJS.Timeout;
  watch(gameDir, { ignoreInitial: true }).on("all", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      wss.clients.forEach((c) => c.send("reload"));
    }, 200); // 200ms 防抖
  });

  server.listen(port);
  return { port, close: () => server.close() };
}
```

### 4.5 上下文收集

```typescript
// cli/context.ts — 收集本地项目文件 (~60行)
import ignore from "ignore";

async function collectLocalContext(cwd: string): Promise<FileContext> {
  // 读取 .gitignore
  const ig = ignore();
  const gitignorePath = path.join(cwd, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, "utf-8"));
  }
  ig.add(["node_modules", ".git", "*.png", "*.jpg", "*.mp3"]);

  // 收集文本文件
  const files: Record<string, string> = {};
  let totalTokens = 0;
  const MAX_TOKENS = 8000;

  const entries = await fs.readdir(cwd, { recursive: true });
  for (const entry of entries) {
    if (ig.ignores(entry)) continue;
    const fullPath = path.join(cwd, entry);
    const stat = await fs.stat(fullPath);
    if (!stat.isFile() || stat.size > 50_000) continue;

    const content = await fs.readFile(fullPath, "utf-8");
    const tokens = Math.ceil(content.length / 4); // 粗略估算

    if (totalTokens + tokens > MAX_TOKENS) break;
    files[entry] = content;
    totalTokens += tokens;
  }

  return {
    projectStructure: Object.keys(files).join("\n"),
    files,
  };
}
```

## 5. 服务端新增

只需一个文件: `src/app/api/game/route.ts`

```typescript
// 复用现有 streamText + DashScope
// 新增: 游戏 system prompt + tool 定义
import { streamText } from "ai";
import { getModel } from "@/lib/llm/model-config";

const GAME_SYSTEM_PROMPT = `你是一个游戏开发专家。根据用户描述生成可运行的 HTML5 游戏。

规则:
- 生成完整的单文件 HTML (内联 CSS/JS)
- 2D 游戏默认用 Canvas API, 复杂场景用 Phaser (CDN)
- 3D 场景用 Three.js (CDN)
- 代码必须能直接在浏览器运行
- 使用 tool_call 写入文件

可用工具: write_file, read_file`;

export async function POST(req: Request) {
  // 认证 + 限流 (复用现有中间件)
  const { messages, context } = await req.json();

  const result = streamText({
    model: getModel(),
    system: GAME_SYSTEM_PROMPT,
    messages: [
      // 注入本地文件上下文
      {
        role: "user",
        content: `当前项目文件:\n${JSON.stringify(context.files)}`,
      },
      ...messages,
    ],
    tools: {
      write_file: {
        description: "写入文件到用户本地项目",
        parameters: z.object({
          path: z.string().describe("相对路径"),
          content: z.string().describe("文件内容"),
        }),
      },
      read_file: {
        description: "读取用户本地项目中的文件",
        parameters: z.object({
          path: z.string().describe("相对路径"),
        }),
      },
    },
  });

  // 返回 SSE 流
  return result.toDataStreamResponse();
}
```

## 6. 游戏引擎策略

| 场景                     | 引擎       | 引入方式 |
| ------------------------ | ---------- | -------- |
| 简单 2D (贪吃蛇、打砖块) | Canvas API | 零依赖   |
| 复杂 2D (平台跳跃、RPG)  | Phaser 3   | CDN      |
| 3D 场景                  | Three.js   | CDN      |
| 物理引擎                 | Matter.js  | CDN      |

LLM 根据需求自动选择, 全部通过 CDN 引入, 无需本地安装。

## 7. CLI 依赖

```json
{
  "name": "spark",
  "bin": { "spark": "./dist/index.js" },
  "dependencies": {
    "commander": "^13.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "inquirer": "^9.0.0",
    "chokidar": "^3.6.0",
    "ws": "^8.16.0",
    "open": "^10.0.0",
    "mime-types": "^2.1.0",
    "ignore": "^5.3.0",
    "marked": "^12.0.0",
    "marked-terminal": "^7.0.0"
  }
}
```

总计 11 个依赖, CLI 核心代码约 500-600 行。

## 8. 用户使用流程

```bash
# 安装
npm install -g spark

# 登录 (首次, MVP 阶段直接配 token)
spark login

# 开始创作
mkdir my-game && cd my-game
spark game

# 交互式对话
> 做一个贪吃蛇游戏, 有计分和关卡

📋 Plan:
  └ 创建 index.html (Canvas 贪吃蛇 + 计分 + 关卡)
确认? [Y] ✓

✓ 写入 index.html (142行)
✓ 预览已打开: http://localhost:4321

> 蛇的颜色改成渐变色, 加粒子特效

✓ 更新 index.html
✓ 浏览器已刷新

> 改成3D版本

📋 Plan:
  ┌ 重写 index.html (Three.js 入口)
  └ 创建 game.js (3D 逻辑)
确认? [Y] ✓

✓ 写入 2 个文件
✓ 浏览器已刷新
```

## 9. 文件结构

```
cli/                            # CLI npm 包 (本仓库路径)
  src/
    index.ts                    # 入口, commander 定义
    chat.ts                     # 对话循环
    stream.ts                   # SSE 客户端
    tools.ts                    # 本地工具执行
    preview.ts                  # 预览服务 + 热更新
    context.ts                  # 上下文收集
    config.ts                   # 配置管理
  package.json
  tsconfig.json

src/app/api/game/               # 服务端 (在现有项目中新增)
  route.ts                      # 游戏生成 API
src/lib/game/
  prompts.ts                    # 游戏 system prompt + few-shot 模板
```

### 代码 diff 方案

3. 语义化 Unified Diff (业界天花板)
   这是 Cursor 的 Fast Edit (Cerebras/Custom Model) 和 Claude Code 正在使用的方案。它们让模型直接输出标准或简化的 diff 格式：

Diff
--- path/to/file.js
+++ path/to/file.js
@@ -10,5 +10,6 @@

- console.log("old");

* console.log("new");
* console.log("incremental");
  实现原理：

专用小模型：Cursor 使用了一个极快的小模型，专门训练它去理解代码结构并生成 diff。

流式 Patch：客户端（编辑器）在接收到 diff 流的同时，就开始在内存中计算新的文件状态，并以“虚影代码”（Ghost Text）的形式渲染。

优点：抗干扰能力强。即便行号稍微对不上，通过 diff 上下文（Context lines）也能准确定位。

业界产品的具体实践链路
A. 预处理：生成前的“裁剪”
在请求 LLM 之前，系统先通过 Tree-sitter 解析代码结构，只把相关的函数签名和上下文发给模型，而不是整个文件。

B. 协议层：工具调用 (Tool Use)
目前最稳健的架构是给 LLM 提供一组精细化的文件操作工具：

read_file(path)：只读文件。

apply_diff(path, hunk)：执行一个特定的 diff 块。

undo()：撤销上一次增量修改（非常重要，给用户容错空间）。

C. 后处理：模糊匹配 (Fuzzy Matching)
由于 LLM 经常会产生细微的缩进错误，业界领先的产品在应用 Diff 时，不会使用严格的字符串相等判断，而是：

忽略空白字符进行匹配。

使用 Levenshtein 距离（编辑距离）：如果匹配度超过 90%，就认为找到了正确位置并强制应用。

## 10. 实施路线

### Phase 1: MVP — 跑通核心闭环

- [x] `cli/` 项目脚手架 (package.json, tsconfig)
- [x] CLI 对话循环 + SSE 流式接收
- [x] 服务端 `/api/game` 端点
- [x] 本地 write_file 工具执行
- [x] 预览服务 + WebSocket 热更新
- [x] 手动配置 token 认证

### Phase 2: 体验打磨

- [ ] Plan 确认机制 (多文件操作)
- [ ] 上下文收集 + token 优化
- [x] 浏览器端代码编辑 — `/spark` + Ace，保存写磁盘；Monaco 替换仍可选
- [ ] loopback 登录流程
- [ ] 错误处理 + 自动重试

### Phase 3: 能力扩展

- [ ] 3D 游戏 (Three.js) 模板
- [ ] 离线模式 (自定义 LLM endpoint / Ollama)
- [ ] 游戏模板库
- [ ] 导出/分享
- [ ] RAG 集成 (参考设计文档)
