import fs from "node:fs";
import path from "node:path";

export interface ToolCall {
  tool: string;
  args: Record<string, string>;
}

export interface ToolResult {
  success: boolean;
  message?: string;
  content?: string;
  error?: string;
}

export async function executeTool(
  toolCall: ToolCall,
  cwd: string
): Promise<ToolResult> {
  switch (toolCall.tool) {
    case "write_file":
      return writeFile(toolCall.args.path, toolCall.args.content, cwd);
    case "read_file":
      return readFile(toolCall.args.path, cwd);
    default:
      return { success: false, error: `未知工具: ${toolCall.tool}` };
  }
}

function resolveSafe(filePath: string, cwd: string): string | null {
  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    return null; // path traversal
  }
  return resolved;
}

async function writeFile(
  filePath: string,
  content: string,
  cwd: string
): Promise<ToolResult> {
  const text = content ?? "";
  if (text.trim().length === 0) {
    return {
      success: false,
      error:
        "拒绝写入空文件（避免把 index.html 等覆盖成空白）。请输出完整文件内容后再调用 write_file。",
    };
  }

  const fullPath = resolveSafe(filePath, cwd);
  if (!fullPath) {
    return { success: false, error: "路径越界，只能写入项目目录" };
  }

  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, text, "utf-8");

  const lines = text.split("\n").length;
  return {
    success: true,
    message: `写入 ${filePath} (${lines}行)`,
  };
}

async function readFile(
  filePath: string,
  cwd: string
): Promise<ToolResult> {
  const fullPath = resolveSafe(filePath, cwd);
  if (!fullPath) {
    return { success: false, error: "路径越界" };
  }

  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `文件不存在: ${filePath}` };
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  return { success: true, content };
}
