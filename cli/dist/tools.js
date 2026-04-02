import fs from "node:fs";
import path from "node:path";
export async function executeTool(toolCall, cwd) {
    switch (toolCall.tool) {
        case "write_file":
            return writeFile(toolCall.args.path, toolCall.args.content, cwd);
        case "read_file":
            return readFile(toolCall.args.path, cwd);
        default:
            return { success: false, error: `未知工具: ${toolCall.tool}` };
    }
}
function resolveSafe(filePath, cwd) {
    const resolved = path.resolve(cwd, filePath);
    if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
        return null; // path traversal
    }
    return resolved;
}
async function writeFile(filePath, content, cwd) {
    const fullPath = resolveSafe(filePath, cwd);
    if (!fullPath) {
        return { success: false, error: "路径越界，只能写入项目目录" };
    }
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    const lines = content.split("\n").length;
    return {
        success: true,
        message: `写入 ${filePath} (${lines}行)`,
    };
}
async function readFile(filePath, cwd) {
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
