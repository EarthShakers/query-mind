import fs from "node:fs";
import path from "node:path";

/** 工作区下固定父目录，每个游戏为其中一级子目录 */
export const GAMES_PARENT_DIR = "games";

/** 规范化游戏子目录名，禁止路径穿越 */
export function normalizeGameSlug(raw: string): string {
  const t = raw
    .trim()
    .replace(/[/\\]+/g, "-")
    .replace(/\s+/g, "-");
  const cleaned = t
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "default";
  }
  return cleaned.slice(0, 120);
}

export function resolveGamesParent(workspaceRoot: string): string {
  return path.resolve(workspaceRoot, GAMES_PARENT_DIR);
}

export function listExistingGameSlugs(workspaceRoot: string): string[] {
  const gamesParent = resolveGamesParent(workspaceRoot);
  try {
    return fs
      .readdirSync(gamesParent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => normalizeGameSlug(entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** 游戏根目录：<workspace>/games/<slug> */
export function resolveGameRoot(workspaceRoot: string, gameSlug: string): string {
  const slug = normalizeGameSlug(gameSlug);
  return path.join(resolveGamesParent(workspaceRoot), slug);
}

const MINIMAL_INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Spark 游戏</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      background: #0f172a;
      color: #94a3b8;
      font-family: system-ui, sans-serif;
      padding: 1rem;
      text-align: center;
    }
    code { color: #7dd3fc; }
    .hint { font-size: 12px; opacity: 0.8; max-width: 28rem; line-height: 1.5; }
  </style>
</head>
<body>
  <p>在 <strong>spark game</strong> 里描述游戏，AI 会通过 <code>write_file</code> 写入完整 <code>index.html</code>。</p>
  <p class="hint">若编辑器里 <code>index.html</code> 为空，通常是模型写入了空内容；已在 CLI 侧拒绝空写入，并会在启动时自动补此占位页。</p>
</body>
</html>
`;

function indexHtmlNeedsSeed(gameRoot: string): boolean {
  const indexPath = path.join(gameRoot, "index.html");
  if (!fs.existsSync(indexPath)) return true;
  try {
    const t = fs.readFileSync(indexPath, "utf-8").trim();
    return t.length === 0;
  } catch {
    return true;
  }
}

export function ensureGameRoot(gameRoot: string): void {
  fs.mkdirSync(gameRoot, { recursive: true });
  if (indexHtmlNeedsSeed(gameRoot)) {
    fs.writeFileSync(
      path.join(gameRoot, "index.html"),
      MINIMAL_INDEX_HTML,
      "utf-8"
    );
  }
}
