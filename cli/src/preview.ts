import fs from "node:fs";
import pathMod from "node:path";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { watch } from "chokidar";
import { lookup } from "mime-types";
import { applyPatch, createTwoFilesPatch } from "diff";
import { normalizeGameSlug } from "./game-root.js";

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIR = pathMod.dirname(THIS_FILE);
const PREVIEW_APP_BUNDLE = pathMod.resolve(THIS_DIR, "../dist/preview-app/app.js");
const MONACO_LOCAL_MIN = pathMod.resolve(
  THIS_DIR,
  "../node_modules/monaco-editor/min"
);

export interface PreviewServer {
  port: number;
  close: () => void;
  setDraft: (draft: { path: string; content: string; isDiff?: boolean; note?: string } | null) => void;
}

function listGameSlugs(gamesParent: string): string[] {
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

const SAVE_MAX_BYTES = 8 * 1024 * 1024;
/** 预览侧栏 / 编辑器 / __spark/raw / __spark/save 仅开放「游戏向」可改文件，不暴露 CLI/工程脚手架 */
const SPARK_USER_EDIT_EXT = new Set([
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".txt",
  ".svg",
]);

const SPARK_DENY_BASENAME_LOWER = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "npm-shrinkwrap.json",
  "tsconfig.json",
  "components.json",
]);

function sparkBasenameLower(rel: string): string {
  const norm = rel.replace(/\\/g, "/");
  const seg = norm.split("/").pop() || "";
  return seg.toLowerCase();
}

function isSparkDenyBasenameLower(baseLower: string): boolean {
  if (SPARK_DENY_BASENAME_LOWER.has(baseLower)) return true;
  if (baseLower.startsWith("tsconfig.") && baseLower.endsWith(".json")) {
    return true;
  }
  const tooling = [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.cjs",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "tailwind.config.js",
    "tailwind.config.ts",
    "tailwind.config.cjs",
    "tailwind.config.mjs",
    "postcss.config.js",
    "postcss.config.cjs",
    "postcss.config.mjs",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "playwright.config.ts",
    "webpack.config.js",
    "webpack.config.cjs",
  ];
  return tooling.includes(baseLower);
}

/** 是否可在 /spark 侧栏列出并由 raw/save 编辑 */
function isSparkUserEditableRel(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!norm || norm.includes("..")) return false;
  const baseLower = sparkBasenameLower(norm);
  if (isSparkDenyBasenameLower(baseLower)) return false;
  const ext = pathMod.extname(baseLower).toLowerCase();
  return SPARK_USER_EDIT_EXT.has(ext);
}

/** 是否禁止通过普通静态 GET 暴露（iframe 拉游戏资源时仍可读图片/字体等） */
function isSparkStaticHttpBlocked(relativeUrlPath: string): boolean {
  const norm = relativeUrlPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!norm) return false;
  const baseLower = sparkBasenameLower(norm);
  if (isSparkDenyBasenameLower(baseLower)) return true;
  const ext = pathMod.extname(baseLower).toLowerCase();
  const blockExt = new Set([
    ".ts",
    ".tsx",
    ".jsx",
    ".mts",
    ".cts",
    ".md",
    ".xml",
    ".map",
  ]);
  return blockExt.has(ext);
}

function listSparkProjectFiles(root: string): string[] {
  const out: string[] = [];
  const ignore = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "coverage",
    ".svn",
    "__pycache__",
  ]);
  function walk(dir: string, relPrefix: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      if (ignore.has(ent.name)) continue;
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
      const full = pathMod.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, rel);
      } else {
        const relPosix = rel.replace(/\\/g, "/");
        if (isSparkUserEditableRel(relPosix)) {
          out.push(relPosix);
        }
      }
    }
  }
  walk(pathMod.resolve(root), "");
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

const MONACO_CDN =
  "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min";

function splitReactShellHtml(port: number, initialGame: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>spark — React Preview</title>
</head>
<body>
  <div id="root"></div>
  <script>
    window.__SPARK_PORT__ = ${port};
    window.__SPARK_INITIAL_GAME__ = ${JSON.stringify(initialGame)};
  </script>
  <script src="/__spark/app.js"></script>
</body>
</html>`;
}

function splitShellHtml(port: number, initialGame: string): string {
  const initialGamePath = `/__spark/game/${encodeURIComponent(initialGame)}/index.html`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>spark — 编辑 · 预览</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; height: 100vh; display: flex; flex-direction: column; font-family: system-ui, sans-serif; background: #0d0d0d; color: #e0e0e0; }
    header { flex: 0 0 auto; padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #2a2a2a; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    header .grow { flex: 1; min-width: 120px; }
    header span.hint { opacity: 0.75; font-size: 12px; }
    #file-path { font-family: ui-monospace, monospace; color: #7dd3fc; }
    .game-picker-open {
      display: flex; align-items: center; gap: 10px;
      background: #111827; color: #e5e7eb; border: 1px solid #374151;
      border-radius: 10px; padding: 6px 12px 6px 8px; font-size: 13px; cursor: pointer;
      max-width: min(320px, 42vw); text-align: left;
    }
    .game-picker-open:hover { border-color: #4b5563; background: #1f2937; }
    .game-picker-open:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
    .game-picker-open-thumb {
      flex: 0 0 40px; width: 40px; height: 40px; border-radius: 8px; overflow: hidden;
      background: #1e293b; display: flex; align-items: center; justify-content: center;
    }
    .game-picker-open-text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .game-picker-open-title { font-weight: 600; color: #f3f4f6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .game-picker-open-slug { font-size: 11px; opacity: 0.65; font-family: ui-monospace, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .game-picker-caret { flex: 0 0 auto; width: 18px; height: 18px; opacity: 0.55; }
    .game-picker-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .game-picker-overlay[hidden] { display: none !important; }
    .game-picker-scrim { position: absolute; inset: 0; background: rgba(0,0,0,0.68); backdrop-filter: blur(5px); }
    .game-picker-panel {
      position: relative; z-index: 1; width: min(920px, 100%); max-height: min(640px, 85vh);
      background: #141414; border: 1px solid #333; border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,0.55);
      display: flex; flex-direction: column; min-height: 0;
    }
    .game-picker-panel-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #2a2a2a; }
    .game-picker-panel-head h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .game-picker-icon-btn {
      width: 36px; height: 36px; border: 0; border-radius: 8px; background: #2a2a2a; color: #e5e7eb;
      font-size: 22px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .game-picker-icon-btn:hover { background: #374151; }
    .game-picker-cards {
      padding: 18px; overflow: auto; display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px;
    }
    .game-picker-card {
      border: 1px solid #333; border-radius: 12px; overflow: hidden; background: #1a1a1a; cursor: pointer;
      padding: 0; margin: 0; font: inherit; color: inherit; text-align: left; transition: border-color 0.15s, transform 0.15s;
    }
    .game-picker-card:hover { border-color: #3b82f6; transform: translateY(-2px); }
    .game-picker-card:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
    .game-picker-card.active { border-color: #60a5fa; box-shadow: 0 0 0 1px #60a5fa; }
    .game-picker-card-media { aspect-ratio: 16 / 10; background: #0f172a; position: relative; }
    .game-picker-icon {
      width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    }
    .game-picker-icon svg {
      flex-shrink: 0;
      color: rgba(255,255,255,0.9);
      stroke: currentColor;
      stroke-width: 2.25;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .game-picker-icon-sm svg { width: 24px; height: 24px; stroke-width: 2; }
    .game-picker-icon-lg svg { width: 52px; height: 52px; stroke-width: 2.35; }
    .game-picker-card-body { padding: 10px 12px 12px; }
    .game-picker-card-title { font-size: 14px; font-weight: 600; color: #f3f4f6; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .game-picker-card-slug { font-size: 11px; color: #64748b; margin-top: 4px; font-family: ui-monospace, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    button {
      background: #2563eb; color: #fff; border: 0; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer;
    }
    button:hover { background: #1d4ed8; }
    button.secondary { background: #374151; }
    button.secondary:hover { background: #4b5563; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    #status { font-size: 12px; min-width: 140px; }
    #status.ok { color: #4ade80; }
    #status.err { color: #f87171; }
    #main-split { flex: 1; display: flex; flex-direction: row; min-height: 0; align-items: stretch; }
    #pane-code {
      flex: 0 0 45%;
      min-width: 200px;
      max-width: 85%;
      display: flex;
      flex-direction: row;
      min-height: 0;
      overflow: hidden;
    }
    #splitter {
      flex: 0 0 10px;
      cursor: col-resize;
      background: #2a2a2a;
      position: relative;
      z-index: 2;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
    }
    /* 扩大可点区域，触控板/窄条不易误触失败 */
    #splitter::before {
      content: "";
      position: absolute;
      left: -8px;
      right: -8px;
      top: 0;
      bottom: 0;
    }
    #splitter:hover, #splitter.dragging { background: #3b82f6; }
    #file-sidebar {
      flex: 0 0 200px; min-width: 160px; max-width: 280px; border-right: 1px solid #2a2a2a;
      display: flex; flex-direction: column; min-height: 0; background: #111;
    }
    #file-sidebar .side-head { padding: 8px 10px; font-size: 12px; font-weight: 600; color: #9ca3af; border-bottom: 1px solid #2a2a2a; }
    #file-tree { flex: 1; overflow: auto; padding: 4px 0; font-size: 12px; font-family: ui-monospace, monospace; }
    #file-tree button.file-item {
      display: block; width: 100%; text-align: left; background: transparent; color: #d1d5db;
      border: 0; border-radius: 0; padding: 6px 10px; font-size: 12px; cursor: pointer;
    }
    #file-tree button.file-item:hover { background: #1f2937; }
    #file-tree button.file-item.active { background: #1e3a5f; color: #93c5fd; }
    #editor-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; position: relative; }
    #editor {
      flex: 1;
      width: 100%;
      min-height: 0;
    }
    #editor-fallback {
      flex: 1; width: 100%; min-height: 0; display: none; border: 0; outline: 0;
      resize: none; background: #0d0d0d; color: #e5e7eb; padding: 14px; font: 13px/1.6 ui-monospace, monospace;
    }
    #editor-fallback.fallback-visible { display: block; }
    #pane-preview { flex: 1 1 auto; min-width: 200px; display: flex; flex-direction: column; background: #111; min-height: 0; }
    #pane-preview iframe { flex: 1; width: 100%; border: 0; background: #1a1a1a; }
    .label { font-weight: 600; letter-spacing: 0.02em; }
    /* Diff Styles */
    .diff-line-addition { background: rgba(46, 160, 67, 0.25) !important; }
    .diff-line-addition-sidebar { background: #2ea043; width: 5px !important; }
    .diff-line-deletion { background: rgba(248, 81, 73, 0.25) !important; }
    .diff-line-deletion-sidebar { background: #f85149; width: 5px !important; }
    
    .diff-hunk-widget {
      background: #1a1a1a; border: 1px solid #2ea043; border-radius: 6px;
      padding: 4px 8px; display: flex; flex-direction: row; align-items: center; gap: 8px; z-index: 500;
      box-shadow: 0 8px 32px rgba(0,0,0,1);
      white-space: nowrap; width: fit-content;
      pointer-events: auto;
      margin-top: -34px;
    }
    .diff-btn {
      padding: 3px 10px; font-size: 11px; border-radius: 4px; cursor: pointer; border: 0;
      color: #fff; font-family: system-ui, -apple-system, sans-serif; font-weight: 600;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .diff-btn-apply { background: #238636; }
    .diff-btn-apply:hover { background: #2ea043; }
    .diff-btn-reject { background: #da3633; }
    .diff-btn-reject:hover { background: #f85149; }
    
    #diff-toolbar {
      position: absolute; top: 10px; right: 20px; z-index: 1000;
      background: #1a1a1a; border: 1px solid #3b82f6; border-radius: 6px;
      padding: 8px 12px; display: none; align-items: center; gap: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.7);
    }
    #diff-toolbar.visible { display: flex; }
    
    .diff-review-banner {
      position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px);
      background: #238636; color: white; padding: 12px 28px; border-radius: 40px;
      font-weight: bold; font-size: 15px; z-index: 1500; box-shadow: 0 12px 40px rgba(0,0,0,0.8);
      pointer-events: none; opacity: 0; transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      border: 1px solid rgba(255,255,255,0.25);
    }
    #diff-toolbar.visible ~ .diff-review-banner { opacity: 1; transform: translateX(-50%) translateY(0); }
  </style>
</head>
<body>
  <header>
    <span class="label">spark</span>
    <div class="game-picker">
      <button type="button" class="game-picker-open" id="game-picker-open" aria-haspopup="dialog" aria-expanded="false" aria-controls="game-picker-panel">
        <span class="game-picker-open-thumb" id="game-picker-open-thumb" aria-hidden="true"></span>
        <span class="game-picker-open-text">
          <span class="game-picker-open-title" id="game-picker-open-title">${initialGame}</span>
          <span class="game-picker-open-slug" id="game-picker-open-slug">${initialGame}</span>
        </span>
        <svg class="game-picker-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>
    <div id="game-picker-overlay" class="game-picker-overlay" hidden>
      <div class="game-picker-scrim" id="game-picker-scrim"></div>
      <div class="game-picker-panel" id="game-picker-panel" role="dialog" aria-modal="true" aria-labelledby="game-picker-heading">
        <div class="game-picker-panel-head">
          <h2 id="game-picker-heading">选择游戏</h2>
          <button type="button" class="game-picker-icon-btn" id="game-picker-dismiss" aria-label="关闭">×</button>
        </div>
        <div id="game-picker-cards" class="game-picker-cards"></div>
      </div>
    </div>
    <span id="file-path">index.html</span>
    <span class="grow"></span>
    <button type="button" class="secondary" id="btn-refresh-tree">刷新列表</button>
    <button type="button" class="secondary" id="btn-reset-split" title="代码区与预览区恢复约各占一半宽度">重置布局</button>
    <button type="button" id="btn-save">保存 (Ctrl+S)</button>
    <span id="status" class="hint"></span>
    <span class="hint">左侧可显示计划/草稿；右侧仅在真实写入后运行</span>
  </header>
  <main id="main-split">
    <div id="pane-code">
      <div id="file-sidebar">
        <div class="side-head">游戏文件（可编辑）</div>
        <div id="file-tree"></div>
      </div>
      <div id="editor-wrap">
        <div id="editor"></div>
        <div id="diff-toolbar">
          <span style="font-size: 12px; color: #60a5fa; font-weight: 600;">检测到增量补丁</span>
          <button type="button" class="diff-btn diff-btn-apply" id="btn-accept-all">全部接受</button>
          <button type="button" class="diff-btn diff-btn-reject" id="btn-reject-all">全部丢弃</button>
        </div>
        <textarea id="editor-fallback" spellcheck="false" class="fallback-visible"></textarea>
        <div class="diff-review-banner">正在预览改动 - 请选择接受或丢弃</div>
      </div>
    </div>
    <div id="splitter" role="separator" aria-orientation="vertical" aria-label="调整代码区与预览区宽度"></div>
    <div id="pane-preview">
      <iframe id="game" title="game" src="${initialGamePath}?nohmr=1"></iframe>
    </div>
  </main>
  <script src="${MONACO_CDN}/vs/loader.js"></script>
  <script>
(function () {
  var port = ${port};
  var params = new URLSearchParams(location.search);
  var currentGame = params.get("game") || ${JSON.stringify(initialGame)};
  var currentFile = params.get("file") || "index.html";

  var iframe = document.getElementById("game");
  var statusEl = document.getElementById("status");
  var btnSave = document.getElementById("btn-save");
  var btnRefreshTree = document.getElementById("btn-refresh-tree");
  var gamePickerOpen = document.getElementById("game-picker-open");
  var gamePickerOpenThumb = document.getElementById("game-picker-open-thumb");
  var gamePickerOpenTitle = document.getElementById("game-picker-open-title");
  var gamePickerOpenSlug = document.getElementById("game-picker-open-slug");
  var gamePickerOverlay = document.getElementById("game-picker-overlay");
  var gamePickerScrim = document.getElementById("game-picker-scrim");
  var gamePickerDismiss = document.getElementById("game-picker-dismiss");
  var gamePickerCards = document.getElementById("game-picker-cards");
  var gameCatalog = [];
  var fileTreeEl = document.getElementById("file-tree");
  var pathEl = document.getElementById("file-path");
  var editorHostEl = document.getElementById("editor");
  var fallbackEditorEl = document.getElementById("editor-fallback");
  var monacoEditor = null;
  var suppressEditorChange = 0;
  var dirty = false;
  var draftState = null;
  /** 编辑器内容与当前加载时的 game 一致时才允许 openFile 短路；换游戏后必须重新拉取 */
  var lastLoadedGame = null;
  /** 用于 Diff 预览时的内容回滚备份 */
  var originalValueForDiff = null;
  var MON_BASE = "${MONACO_CDN}";

  pathEl.textContent = currentFile;

  function slugHue(slug) {
    var h = 0;
    for (var i = 0; i < slug.length; i++) {
      h = ((h << 5) - h + slug.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 360;
  }

  function gradientStyleForSlug(slug) {
    var h = slugHue(slug);
    return (
      "linear-gradient(135deg, hsl(" +
      h +
      ",55%,28%), hsl(" +
      ((h + 44) % 360) +
      ",50%,18%))"
    );
  }

  function catalogEntryForSlug(slug) {
    for (var i = 0; i < gameCatalog.length; i++) {
      if (gameCatalog[i].slug === slug) return gameCatalog[i];
    }
    return { slug: slug, title: slug, cover: null };
  }

  /** 按游戏目录 slug 内联语义图标（不加载封面照片） */
  function semanticIconSvg(slug) {
    var s = (slug || "").toLowerCase();
    if (s === "default") {
      return (
        '<svg viewBox="0 0 64 64" aria-hidden="true">' +
        '<rect x="14" y="12" width="36" height="40" rx="5" fill="rgba(255,255,255,0.07)" stroke="currentColor"/>' +
        '<path d="M22 24h20M22 32h14M22 40h18" fill="none"/>' +
        '<path d="M42 10l8 5-2 10-10-2 4-13z" fill="rgba(255,255,255,0.22)" stroke="currentColor" stroke-width="1.8"/>' +
        "</svg>"
      );
    }
    if (s === "memory-card") {
      return (
        '<svg viewBox="0 0 64 64" aria-hidden="true">' +
        '<g fill="rgba(255,255,255,0.06)" stroke="currentColor">' +
        '<rect x="10" y="20" width="20" height="28" rx="3" transform="rotate(-9 20 34)"/>' +
        '<rect x="30" y="16" width="20" height="28" rx="3" transform="rotate(11 40 30)"/>' +
        "</g>" +
        "</svg>"
      );
    }
    if (s === "neon-snake") {
      return (
        '<svg viewBox="0 0 64 64" aria-hidden="true">' +
        '<path d="M8 46 C8 46 18 14 32 26 S54 18 56 20" fill="none"/>' +
        '<circle cx="8" cy="46" r="4.5" fill="currentColor" stroke="none"/>' +
        "</svg>"
      );
    }
    if (s === "tank-battle") {
      return (
        '<svg viewBox="0 0 64 64" aria-hidden="true">' +
        '<rect x="6" y="34" width="52" height="15" rx="3" fill="rgba(255,255,255,0.07)" stroke="currentColor"/>' +
        '<circle cx="18" cy="49" r="5.5" fill="rgba(255,255,255,0.05)" stroke="currentColor"/>' +
        '<circle cx="46" cy="49" r="5.5" fill="rgba(255,255,255,0.05)" stroke="currentColor"/>' +
        '<rect x="28" y="22" width="8" height="14" fill="rgba(255,255,255,0.06)" stroke="currentColor"/>' +
        '<rect x="30" y="14" width="16" height="5" rx="1.5" fill="rgba(255,255,255,0.08)" stroke="currentColor"/>' +
        "</svg>"
      );
    }
    if (s === "gobang") {
      return (
        '<svg viewBox="0 0 64 64" aria-hidden="true">' +
        '<path d="M22 20v24M30 20v24M38 20v24M46 20v24M22 28h24M22 36h24M22 44h24" fill="none" stroke="currentColor" opacity="0.35"/>' +
        '<circle cx="30" cy="34" r="3.5" fill="currentColor" stroke="none"/>' +
        '<circle cx="38" cy="38" r="3.5" fill="currentColor" stroke="none" opacity="0.45"/>' +
        '<circle cx="34" cy="44" r="3.5" fill="currentColor" stroke="none"/>' +
        "</svg>"
      );
    }
    if (s === "flappy-bird") {
      return (
        '<svg viewBox="0 0 64 64" aria-hidden="true">' +
        '<path d="M12 36 Q18 22 32 28 L42 23 L42 32 L34 34 Q32 44 20 44 Q12 44 12 36Z" fill="rgba(255,255,255,0.1)" stroke="currentColor"/>' +
        '<circle cx="28" cy="32" r="2.2" fill="currentColor" stroke="none"/>' +
        '<rect x="46" y="8" width="8" height="14" rx="1" fill="rgba(255,255,255,0.06)" stroke="currentColor"/>' +
        '<rect x="46" y="42" width="8" height="14" rx="1" fill="rgba(255,255,255,0.06)" stroke="currentColor"/>' +
        "</svg>"
      );
    }
    return (
      '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      '<rect x="10" y="18" width="44" height="30" rx="9" fill="rgba(255,255,255,0.06)" stroke="currentColor"/>' +
      '<circle cx="22" cy="33" r="3.5" fill="currentColor" stroke="none"/>' +
      '<rect x="36" y="29" width="12" height="3.5" rx="1" fill="currentColor" stroke="none"/>' +
      '<rect x="40.25" y="25.5" width="3.5" height="12" rx="1" fill="currentColor" stroke="none"/>' +
      "</svg>"
    );
  }

  function renderSemanticGameIcon(container, slug, size) {
    container.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "game-picker-icon game-picker-icon-" + size;
    wrap.style.background = gradientStyleForSlug(slug);
    wrap.innerHTML = semanticIconSvg(slug);
    container.appendChild(wrap);
  }

  function syncGamePickerTrigger() {
    if (!gamePickerOpenTitle || !gamePickerOpenSlug || !gamePickerOpenThumb) return;
    var e = catalogEntryForSlug(currentGame);
    gamePickerOpenTitle.textContent = e.title || e.slug;
    gamePickerOpenSlug.textContent = e.slug;
    renderSemanticGameIcon(gamePickerOpenThumb, e.slug, "sm");
  }

  function setGamePickerExpanded(on) {
    if (gamePickerOpen) gamePickerOpen.setAttribute("aria-expanded", on ? "true" : "false");
  }

  function openGamePicker() {
    if (!gamePickerOverlay) return;
    gamePickerOverlay.hidden = false;
    setGamePickerExpanded(true);
    renderGamePickerGrid();
    try {
      if (gamePickerDismiss) gamePickerDismiss.focus();
    } catch (eOpen) {}
  }

  function closeGamePicker() {
    if (!gamePickerOverlay) return;
    gamePickerOverlay.hidden = true;
    setGamePickerExpanded(false);
    try {
      if (gamePickerOpen) gamePickerOpen.focus();
    } catch (eClose) {}
  }

  function renderGamePickerGrid() {
    if (!gamePickerCards) return;
    gamePickerCards.innerHTML = "";
    gameCatalog.forEach(function (entry) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "game-picker-card" + (entry.slug === currentGame ? " active" : "");
      var media = document.createElement("div");
      media.className = "game-picker-card-media";
      renderSemanticGameIcon(media, entry.slug, "lg");
      var body = document.createElement("div");
      body.className = "game-picker-card-body";
      var t = document.createElement("div");
      t.className = "game-picker-card-title";
      t.textContent = entry.title || entry.slug;
      var sub = document.createElement("div");
      sub.className = "game-picker-card-slug";
      sub.textContent = entry.slug;
      body.appendChild(t);
      body.appendChild(sub);
      btn.appendChild(media);
      btn.appendChild(body);
      btn.addEventListener("click", function () {
        closeGamePicker();
        if (entry.slug === currentGame) return;
        switchCurrentGame(entry.slug);
      });
      gamePickerCards.appendChild(btn);
    });
  }

  function switchCurrentGame(nextSlug) {
    currentGame = nextSlug || ${JSON.stringify(initialGame)};
    currentFile = "index.html";
    draftState = null;
    lastLoadedGame = null;
    btnSave.disabled = false;
    pathEl.textContent = currentFile;
    updateUrl();
    syncGamePickerTrigger();
    fetchFileList()
      .then(function () {
        return openFile(currentFile);
      })
      .then(function () {
        bumpIframe();
      });
  }

  syncGamePickerTrigger();

  function setStatus(msg, ok) {
    statusEl.textContent = msg;
    statusEl.className = ok ? "ok" : "err";
  }

  function languageForPath(name) {
    var ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript";
    if (ext === "css") return "css";
    if (ext === "json") return "json";
    if (ext === "md") return "markdown";
    if (ext === "ts" || ext === "tsx") return "typescript";
    if (ext === "jsx") return "javascript";
    if (ext === "html" || ext === "htm") return "html";
    return "plaintext";
  }

  function applyEditorLanguage() {
    if (monacoEditor && monacoEditor.getModel && monacoEditor.getModel()) {
      monaco.editor.setModelLanguage(monacoEditor.getModel(), languageForPath(currentFile));
    }
  }

  function getCurrentEditorValue() {
    return monacoEditor ? monacoEditor.getValue() : fallbackEditorEl.value;
  }

  function setCurrentEditorValue(text) {
    if (monacoEditor) {
      suppressEditorChange++;
      try {
        monacoEditor.setValue(text || "");
        applyEditorLanguage();
      } finally {
        suppressEditorChange--;
      }
    } else {
      fallbackEditorEl.value = text;
    }
  }

  function layoutMonaco() {
    if (monacoEditor) monacoEditor.layout();
  }

  function currentEditorHasModel() {
    if (monacoEditor) return true;
    return !!fallbackEditorEl.value;
  }

  function hasDraftForCurrentFile() {
    return !!(draftState && draftState.path === currentFile);
  }

  function applyDraftToEditor() {
    if (!hasDraftForCurrentFile()) return false;
    setCurrentEditorValue(draftState.content || "");
    dirty = false;
    btnSave.disabled = true;
    setStatus(draftState.note || "正在显示生成草稿，待真实写入后可保存", true);
    lastLoadedGame = currentGame;
    return true;
  }

  function bumpIframe() {
    iframe.src =
      "/__spark/game/" +
      encodeURIComponent(currentGame) +
      "/index.html?nohmr=1&t=" +
      Date.now();
  }

  function rawUrl(rel) {
    var parts = rel.split("/").filter(Boolean);
    return "/__spark/raw/" + parts.map(encodeURIComponent).join("/") + "?game=" + encodeURIComponent(currentGame);
  }

  function updateUrl() {
    history.replaceState(
      null,
      "",
      "?game=" + encodeURIComponent(currentGame) + "&file=" + encodeURIComponent(currentFile)
    );
  }

  function highlightTreeActive() {
    var btns = fileTreeEl.querySelectorAll("button.file-item");
    btns.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-path") === currentFile);
    });
  }

  function renderFileList(files) {
    fileTreeEl.innerHTML = "";
    if (!files || !files.length) {
      fileTreeEl.textContent = "（无匹配文件）";
      return;
    }
    files.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "file-item";
      btn.setAttribute("data-path", p);
      btn.textContent = p;
      btn.addEventListener("click", function () {
        openFile(p);
      });
      fileTreeEl.appendChild(btn);
    });
    highlightTreeActive();
  }

  function fetchGames() {
    return fetch("/__spark/games")
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (j) {
        var games = j.games || [];
        var catalog = j.catalog;
        if (catalog && catalog.length) {
          gameCatalog = catalog;
        } else {
          gameCatalog = games.map(function (slug) {
            return { slug: slug, title: slug, cover: null };
          });
        }
        if (games.length && games.indexOf(currentGame) < 0) {
          currentGame = games[0];
        }
        if (gameCatalog.length) {
          var found = false;
          for (var i = 0; i < gameCatalog.length; i++) {
            if (gameCatalog[i].slug === currentGame) {
              found = true;
              break;
            }
          }
          if (!found) currentGame = gameCatalog[0].slug;
        }
        syncGamePickerTrigger();
      })
      .catch(function () {
        syncGamePickerTrigger();
      });
  }

  function fetchFileList() {
    var gameSnapshot = currentGame;
    return fetch("/__spark/list?game=" + encodeURIComponent(gameSnapshot))
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (j) {
        if (gameSnapshot !== currentGame) return [];
        var files = j.files || [];
        renderFileList(files);
        if (files.length && files.indexOf(currentFile) < 0) {
          currentFile = files[0];
          pathEl.textContent = currentFile;
          updateUrl();
        }
        return files;
      })
      .catch(function () {
        if (gameSnapshot !== currentGame) return [];
        fileTreeEl.textContent = "无法加载列表";
        return [];
      });
  }

  function openFile(rel, force) {
    force = !!force;
    if (
      !force &&
      rel === currentFile &&
      currentEditorHasModel() &&
      lastLoadedGame === currentGame
    ) {
      return Promise.resolve();
    }
    if (dirty) {
      if (!confirm("当前文件未保存，切换将丢失修改。是否继续？")) return;
    }
    currentFile = rel;
    pathEl.textContent = currentFile;
    updateUrl();
    highlightTreeActive();
    if (applyDraftToEditor()) {
      return Promise.resolve();
    }
    var gameSnapshot = currentGame;
    return fetch(rawUrl(currentFile))
      .then(function (r) {
        if (gameSnapshot !== currentGame) return "__stale__";
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(function (text) {
        if (text === "__stale__") return;
        if (gameSnapshot !== currentGame) return;
        setCurrentEditorValue(text);
        lastLoadedGame = currentGame;
        dirty = false;
        btnSave.disabled = false;
        setStatus("", true);
        layoutMonaco();
      })
      .catch(function () {
        if (gameSnapshot !== currentGame) return;
        setCurrentEditorValue("<!-- 文件不存在，保存将创建 -->");
        lastLoadedGame = currentGame;
        dirty = true;
        layoutMonaco();
      });
  }

  function loadSourceDisk() {
    if (applyDraftToEditor()) {
      return Promise.resolve();
    }
    var gameSnapshot = currentGame;
    var pathSnapshot = currentFile;
    return fetch(rawUrl(currentFile))
      .then(function (r) {
        if (gameSnapshot !== currentGame || pathSnapshot !== currentFile) return "__stale__";
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(function (text) {
        if (text === "__stale__") return;
        if (gameSnapshot !== currentGame || pathSnapshot !== currentFile) return;
        if (dirty) {
          if (!confirm("磁盘上的文件已变化，是否放弃未保存修改并重新加载？")) return;
        }
        setCurrentEditorValue(text);
        lastLoadedGame = currentGame;
        dirty = false;
        btnSave.disabled = false;
        setStatus("", true);
      })
      .catch(function () {});
  }

  function save() {
    btnSave.disabled = true;
    setStatus("保存中…", true);
    var content = getCurrentEditorValue();
    fetch("/__spark/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: currentGame, path: currentFile, content: content }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || !j.ok) throw new Error(j.error || r.statusText);
          return j;
        });
      })
      .then(function () {
        dirty = false;
        setStatus("已保存", true);
        bumpIframe();
        fetchFileList();
      })
      .catch(function (e) {
        setStatus("保存失败: " + (e && e.message ? e.message : e), false);
      })
      .finally(function () {
        btnSave.disabled = false;
      });
  }
  fallbackEditorEl.addEventListener("input", function () {
    if (hasDraftForCurrentFile()) {
      setStatus("当前是生成草稿，等待真实写入完成后再编辑/保存", false);
      fallbackEditorEl.value = draftState.content || "";
      return;
    }
    dirty = true;
    statusEl.textContent = "";
    statusEl.className = "hint";
    btnSave.disabled = false;
  });

  function initSplitter() {
    var main = document.getElementById("main-split");
    var paneCode = document.getElementById("pane-code");
    var splitter = document.getElementById("splitter");
    if (!main || !paneCode || !splitter) return;
    var stored = null;
    try {
      stored = localStorage.getItem("spark.splitLeftPx");
    } catch (e0) {}
    var w = stored ? parseInt(stored, 10) : NaN;
    var total0 = main.getBoundingClientRect().width;
    var splitterGrip = 10;
    if (!(w >= 200) || w > total0 - 220) {
      w = Math.max(280, Math.floor(total0 * 0.45));
    }
    paneCode.style.flex = "0 0 " + w + "px";

    var dragActive = false;
    var dragPointerId = null;
    var startX = 0;
    var startW = 0;

    var minSplitL = 200;
    var minSplitR = 200;

    function applySplitWidth(clientX) {
      var dx = clientX - startX;
      var nw = startW + dx;
      var total = main.getBoundingClientRect().width;
      nw = Math.max(minSplitL, Math.min(nw, total - minSplitR - splitterGrip));
      paneCode.style.flex = "0 0 " + nw + "px";
      layoutMonaco();
    }

    function resetSplitToCenter() {
      var total = main.getBoundingClientRect().width;
      var ideal = Math.floor((total - splitterGrip) / 2);
      var nw = Math.max(
        minSplitL,
        Math.min(ideal, total - minSplitR - splitterGrip)
      );
      paneCode.style.flex = "0 0 " + nw + "px";
      layoutMonaco();
      try {
        localStorage.setItem("spark.splitLeftPx", String(Math.round(nw)));
      } catch (eReset) {}
    }

    function endSplitDrag() {
      if (!dragActive) return;
      dragActive = false;
      dragPointerId = null;
      splitter.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      layoutMonaco();
      try {
        localStorage.setItem(
          "spark.splitLeftPx",
          String(Math.round(paneCode.getBoundingClientRect().width))
        );
      } catch (e1) {}
    }

    function onPointerMove(e) {
      if (!dragActive) return;
      if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
      e.preventDefault();
      applySplitWidth(e.clientX);
    }

    function onPointerUp(e) {
      if (!dragActive) return;
      if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
      try {
        splitter.releasePointerCapture(e.pointerId);
      } catch (eRel) {}
      endSplitDrag();
    }

    splitter.addEventListener(
      "pointerdown",
      function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        dragActive = true;
        dragPointerId = e.pointerId;
        startX = e.clientX;
        startW = paneCode.getBoundingClientRect().width;
        splitter.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        try {
          splitter.setPointerCapture(e.pointerId);
        } catch (eCap) {}
      },
      { passive: false }
    );

    splitter.addEventListener("pointermove", onPointerMove, { passive: false });
    splitter.addEventListener("pointerup", onPointerUp);
    splitter.addEventListener("pointercancel", onPointerUp);
    splitter.addEventListener("lostpointercapture", function () {
      if (dragActive) endSplitDrag();
    });

    var btnResetSplit = document.getElementById("btn-reset-split");
    if (btnResetSplit) {
      btnResetSplit.addEventListener("click", function () {
        resetSplitToCenter();
      });
    }

    window.addEventListener("resize", function () {
      layoutMonaco();
    });
  }

  function wireMonacoChange() {
    if (!monacoEditor) return;
    monacoEditor.onDidChangeModelContent(function () {
      if (suppressEditorChange > 0) return;
      if (hasDraftForCurrentFile()) {
        setStatus("当前是生成草稿，等待真实写入完成后再编辑/保存", false);
        suppressEditorChange++;
        try {
          monacoEditor.setValue(draftState.content || "");
        } finally {
          suppressEditorChange--;
        }
        return;
      }
      dirty = true;
      statusEl.textContent = "";
      statusEl.className = "hint";
      btnSave.disabled = false;
    });
  }

  function boot() {
    initSplitter();
    fetchGames()
      .then(function () {
        return fetchFileList();
      })
      .then(function () {
        return openFile(currentFile);
      })
      .then(function () {
        layoutMonaco();
      });
  }

  btnSave.addEventListener("click", save);
  if (gamePickerOpen) {
    gamePickerOpen.addEventListener("click", function () {
      openGamePicker();
    });
  }
  if (gamePickerScrim) {
    gamePickerScrim.addEventListener("click", function () {
      closeGamePicker();
    });
  }
  if (gamePickerDismiss) {
    gamePickerDismiss.addEventListener("click", function () {
      closeGamePicker();
    });
  }
  btnRefreshTree.addEventListener("click", function () {
    fetchFileList().then(function () {
      return openFile(currentFile, true);
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && gamePickerOverlay && !gamePickerOverlay.hidden) {
      e.preventDefault();
      closeGamePicker();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      save();
    }
  });

  if (typeof require !== "undefined") {
    self.MonacoEnvironment = {
      getWorkerUrl: function (_moduleId, label) {
        var b = MON_BASE + "/vs";
        if (label === "json") return b + "/language/json/json.worker.js";
        if (label === "css" || label === "scss" || label === "less")
          return b + "/language/css/css.worker.js";
        if (label === "html" || label === "handlebars" || label === "razor")
          return b + "/language/html/html.worker.js";
        if (label === "typescript" || label === "javascript")
          return b + "/language/typescript/ts.worker.js";
        return b + "/editor/editor.worker.js";
      },
    };
    require.config({ paths: { vs: MON_BASE + "/vs" } });
    require(
      ["vs/editor/editor.main"],
      function () {
        monaco.editor.defineTheme("spark-dark", {
          base: "vs-dark",
          inherit: true,
          rules: [],
          colors: { "editor.background": "#0d0d0d" },
        });
        monaco.editor.setTheme("spark-dark");
        monacoEditor = monaco.editor.create(editorHostEl, {
          value: "",
          language: "html",
          fontSize: 13,
          wordWrap: "on",
          minimap: { enabled: false },
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          overviewRulerLanes: 3,
          overviewRulerBorder: true,
          glyphMargin: true,
          renderLineHighlight: "all",
          scrollbar: {
            vertical: "visible",
            horizontal: "visible",
            useShadows: true,
            verticalHasArrows: false,
            horizontalHasArrows: false,
            verticalScrollbarSize: 14,
          }
        });
        wireMonacoChange();
        fallbackEditorEl.classList.remove("fallback-visible");
        fallbackEditorEl.style.display = "none";
        boot();
      },
      function (err) {
        console.error("[spark] Monaco load error:", err);
        if (editorHostEl) editorHostEl.style.display = "none";
        fallbackEditorEl.classList.add("fallback-visible");
        fallbackEditorEl.style.display = "block";
        boot();
      }
    );
  } else {
    boot();
  }

  function parseUnifiedDiff(diffText) {
    var lines = diffText.split("\\n");
    var hunks = [];
    var currentHunk = null;
    console.log("[spark] Starting parse: " + lines.length + " lines");
    
    for (var i = 0; i < lines.length; i++) {
      var rawLine = lines[i];
      var line = rawLine.trim();
      if (!line && !currentHunk) continue;

      // 超强鲁棒性正则：允许 @@ 前后有空格，允许数字间空格不一致
      var m = line.match(/@@\\s+-(\\d+),?(\\d*)\\s+\\+(\\d+),?(\\d*)\\s+@@/);
      if (m) {
        if (currentHunk) hunks.push(currentHunk);
        currentHunk = {
          oldStart: parseInt(m[1], 10),
          oldLines: parseInt(m[2] || "1", 10),
          newStart: parseInt(m[3], 10),
          newLines: parseInt(m[4] || "1", 10),
          lines: [],
        };
        console.log("[spark] Found hunk header:", line);
        continue;
      }

      if (currentHunk) {
        // 由于上面执行过 line = rawLine.trim()，我们要重新看 rawLine 的内容
        if (rawLine.startsWith("+") || rawLine.startsWith("-") || rawLine.startsWith(" ")) {
          currentHunk.lines.push(rawLine);
        } else if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("\\\\")) {
          // skip metadata
        } else if (line) {
          // 适配 AI 漏写空格的情况，但要保护原有的 + 和 - 标记
          if (!line.startsWith("DIFF:")) {
            var prefix = (line.startsWith("+") || line.startsWith("-")) ? "" : " ";
            currentHunk.lines.push(prefix + rawLine);
          }
        }
      }
    }
    if (currentHunk) hunks.push(currentHunk);
    console.log("[spark] Parse complete, hunks found:", hunks.length);
    return hunks;
  }

  var diffDecorations = [];
  var hunkWidgets = [];

  function clearDiffDecorations() {
    if (monacoEditor) {
      diffDecorations = monacoEditor.deltaDecorations(diffDecorations, []);
      hunkWidgets.forEach(function (w) {
        monacoEditor.removeContentWidget(w);
      });
      hunkWidgets = [];
      document.getElementById("diff-toolbar").classList.remove("visible");
    }
  }

  function applyHunk(hunk) {
    if (!monacoEditor) return;
    refreshDiffViewManually(); 
  }

  function refreshDiffViewManually() {
    clearDiffDecorations();
    applyDraftToEditor();
  }

  function computeHybridContent(original, hunks) {
    var lines = original.split(/\\r?\\n/);
    var sortedHunks = hunks.slice().sort(function(a, b) {
      return b.oldStart - a.oldStart;
    });
    var lineTypes = lines.map(function() { return 0; });

    sortedHunks.forEach(function(hunk) {
      var startIdx = hunk.oldStart - 1;
      var hybridHunkLines = hunk.lines.map(function(l) { return l.slice(1); });
      var hybridHunkTypes = hunk.lines.map(function(l) { return l.startsWith("+") ? 1 : (l.startsWith("-") ? -1 : 0); });
      
      var spliceArgsLines = [startIdx, hunk.oldLines].concat(hybridHunkLines);
      var spliceArgsTypes = [startIdx, hunk.oldLines].concat(hybridHunkTypes);
      
      lines.splice.apply(lines, spliceArgsLines);
      lineTypes.splice.apply(lineTypes, spliceArgsTypes);
    });
    return { content: lines.join("\n"), types: lineTypes };
  }

  function renderDiffHunks(hunks, lineTypes) {
    if (!monacoEditor) return;
    document.getElementById("diff-toolbar").classList.add("visible");
    var decorations = [];
    
    // 对 lineTypes 建立渲染装饰
    lineTypes.forEach(function(type, idx) {
      var lineNum = idx + 1;
      if (type === 1) { // Added
        decorations.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: { 
            isWholeLine: true, 
            className: "diff-line-addition", 
            glyphMarginClassName: "diff-line-addition-sidebar",
            overviewRuler: { color: "#2ea043", position: 7 }
          }
        });
      } else if (type === -1) { // Deleted
        decorations.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: { 
            isWholeLine: true, 
            className: "diff-line-deletion", 
            glyphMarginClassName: "diff-line-deletion-sidebar",
            overviewRuler: { color: "#f85149", position: 7 }
          }
        });
      }
    });

    var sortedHunks = hunks.slice().sort(function(a, b) { return a.oldStart - b.oldStart; });
    sortedHunks.forEach(function(hunk, hunkIdx) {
      // 寻找该 hunk 在 lineTypes 中的逻辑起始行
      var hybridStartLine = 1;
      var matchesNeeded = hunk.oldStart;
      var originalLinesFound = 0;
      
      for (var i = 0; i < lineTypes.length; i++) {
        if (lineTypes[i] === 0 || lineTypes[i] === -1) { 
          originalLinesFound++;
        }
        if (originalLinesFound === matchesNeeded) {
          hybridStartLine = i + 1;
          // 向上溯源到该块的第一个变动行（处理前面全是 + 的情况）
          while (hybridStartLine > 1 && lineTypes[hybridStartLine - 2] !== 0) {
            hybridStartLine--;
          }
          break;
        }
      }

      var widgetId = "hunk-widget-" + hunkIdx;
      var domNode = document.createElement("div");
      domNode.className = "diff-hunk-widget";
      var btnApply = document.createElement("button");
      btnApply.className = "diff-btn diff-btn-apply";
      btnApply.textContent = "Apply";
      btnApply.onclick = function() { applyHunk(hunk); };
      var btnReject = document.createElement("button");
      btnReject.className = "diff-btn diff-btn-reject";
      btnReject.textContent = "Reject";
      btnReject.onclick = function() { refreshDiffViewManually(); };
      domNode.appendChild(btnApply);
      domNode.appendChild(btnReject);

      var widget = {
        getId: function() { return widgetId; },
        getDomNode: function() { return domNode; },
        getPosition: function() {
          return {
            position: { lineNumber: Math.max(1, hybridStartLine), column: 1 },
            preference: [1, 2] 
          };
        }
      };
      monacoEditor.addContentWidget(widget);
      hunkWidgets.push(widget);
    });

    diffDecorations = monacoEditor.deltaDecorations(diffDecorations, decorations);
  }

  document.getElementById("btn-accept-all").onclick = function() {
    if (draftState && draftState.isDiff) {
      var hunks = parseUnifiedDiff(draftState.content);
      var patched = computePatchedContent(originalValueForDiff, hunks);
      setCurrentEditorValue(patched);
      originalValueForDiff = null;
      clearDiffDecorations();
      draftState = null;
      btnSave.disabled = false;
      setStatus("已接受所有更改", true);
    }
  };
  document.getElementById("btn-reject-all").onclick = function() {
    if (originalValueForDiff !== null) {
      setCurrentEditorValue(originalValueForDiff);
      originalValueForDiff = null;
    }
    clearDiffDecorations();
    draftState = null;
    btnSave.disabled = false;
    setStatus("已放弃所有更改", true);
  };

  function computePatchedContent(original, hunks) {
    var lines = original.split(/\\r?\\n/);
    var sortedHunks = hunks.slice().sort(function(a, b) {
      return b.oldStart - a.oldStart;
    });

    sortedHunks.forEach(function(hunk) {
      var startIdx = hunk.oldStart - 1;
      var deleteCount = hunk.oldLines;
      var newHunkLines = hunk.lines.filter(function(l) { return !l.startsWith("-"); })
                                   .map(function(l) { return l.slice(1); });
      lines.splice.apply(lines, [startIdx, deleteCount].concat(newHunkLines));
    });
    return lines.join("\n");
  }

  function applyDraftToEditor() {
    if (!hasDraftForCurrentFile()) return false;
    if (draftState.isDiff && monacoEditor) {
      var hunks = parseUnifiedDiff(draftState.content);
      if (originalValueForDiff === null) {
        originalValueForDiff = getCurrentEditorValue();
      }

      if (hunks.length === 0 && draftState.content.trim().length > 0) {
        setStatus("补丁解析失败：格式不规范", false);
        setCurrentEditorValue(draftState.content);
      } else {
        var hybrid = computeHybridContent(originalValueForDiff, hunks);
        setCurrentEditorValue(hybrid.content);
        setTimeout(function() {
          renderDiffHunks(hunks, hybrid.types);
        }, 50);
        setStatus(draftState.note || "正在预览行内补丁", true);
      }
      return true;
    }
    setCurrentEditorValue(draftState.content || "");
    dirty = false;
    btnSave.disabled = true;
    setStatus(draftState.note || "正在显示生成草稿", true);
    return true;
  }

  try {
    var ws = new WebSocket("ws://" + location.hostname + ":" + port);
    ws.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data);
        if (data && data.type === "draft") {
          if (data.payload && data.payload.path) {
            var oldPath = draftState ? draftState.path : null;
            draftState = data.payload;
            if (!currentFile || currentFile === "index.html" || currentFile === draftState.path) {
              if (currentFile !== draftState.path) {
                currentFile = draftState.path;
                pathEl.textContent = currentFile;
                updateUrl();
                highlightTreeActive();
              }
              if (oldPath !== draftState.path) {
                clearDiffDecorations();
              }
              applyDraftToEditor();
            }
          } else {
            // 如果是 diff 模式，流结束时不要立刻清除 draftState，给用户处理的机会
            if (draftState && draftState.isDiff) {
              setStatus("补丁生成已完成，等待审核应用", true);
              btnSave.disabled = true; // 依然不让保存，直到处理补丁
            } else {
              draftState = null;
              clearDiffDecorations();
              btnSave.disabled = false;
              setStatus("草稿已完成，已切回真实文件", true);
            }
            fetchFileList().then(loadSourceDisk).then(bumpIframe);
          }
          return;
        }
      } catch (e) {}

      fetchFileList().then(function () {
        return loadSourceDisk();
      }).then(function () {
        bumpIframe();
      });
    };
  } catch (e) {}

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      fetchFileList().then(function () {
        return loadSourceDisk();
      });
    }
  });
})();
  </script>
</body>
</html>`;
}

function isPathInsideRoot(filePath: string, root: string): boolean {
  const resolved = pathMod.resolve(filePath);
  const rootResolved = pathMod.resolve(root);
  return resolved === rootResolved || resolved.startsWith(rootResolved + pathMod.sep);
}

interface DiffHunk {
  index: number;
  rawHeader: string;
  rawLines: string[];
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const lines = diffText.replace(/\r\n/g, "\n").split("\n");
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let idx = 0;
  const headerRe = /^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/;
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (current) hunks.push(current);
      current = {
        index: idx++,
        rawHeader: line,
        rawLines: [],
        oldStart: Number(m[1]),
        oldLines: m[2] ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newLines: m[4] ? Number(m[4]) : 1,
      };
      continue;
    }
    if (!current) continue;
    if (
      line.startsWith(" ") ||
      line.startsWith("+") ||
      line.startsWith("-")
    ) {
      current.rawLines.push(line);
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

function normalizeSparkText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function findHunkStart(
  lines: string[],
  startIdx: number,
  expectedOld: string[]
): number {
  const maxDrift = 200;
  const n = expectedOld.length;
  const start = Math.max(0, startIdx - maxDrift);
  const end = Math.min(lines.length - n, startIdx + maxDrift);
  for (let i = start; i <= end; i += 1) {
    let ok = true;
    for (let j = 0; j < n; j += 1) {
      if (lines[i + j] !== expectedOld[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function applyHunksToText(original: string, hunks: DiffHunk[]): string {
  const normalized = normalizeSparkText(original);
  const lines = normalized.split("\n");
  const hasTrailingNewline = normalized.endsWith("\n") || normalized.length === 0;
  const sorted = hunks.slice().sort((a, b) => b.oldStart - a.oldStart);
  for (const hunk of sorted) {
    const expectedOld = hunk.rawLines
      .filter((line) => !line.startsWith("+"))
      .map((line) => line.slice(1));
    const replacement = hunk.rawLines
      .filter((line) => !line.startsWith("-"))
      .map((line) => line.slice(1));
    let startIdx = Math.max(0, hunk.oldStart - 1);
    if (expectedOld.length > 0) {
      const candidate = lines.slice(startIdx, startIdx + expectedOld.length);
      const exact = candidate.length === expectedOld.length &&
        candidate.every((line, i) => line === expectedOld[i]);
      if (!exact) {
        const found = findHunkStart(lines, startIdx, expectedOld);
        if (found < 0) {
          throw new Error(`hunk mismatch around ${hunk.rawHeader}`);
        }
        startIdx = found;
      }
    } else {
      startIdx = Math.min(lines.length, startIdx);
    }
    lines.splice(startIdx, expectedOld.length, ...replacement);
  }
  const result = lines.join("\n");
  return hasTrailingNewline && !result.endsWith("\n") ? `${result}\n` : result;
}

function formatUnifiedHunkHeader(
  oldStart: number,
  oldLines: number,
  newStart: number,
  newLines: number
): string {
  const o =
    oldLines === 0
      ? `${oldStart},0`
      : oldLines === 1
        ? `${oldStart}`
        : `${oldStart},${oldLines}`;
  const n =
    newLines === 0
      ? `${newStart},0`
      : newLines === 1
        ? `${newStart}`
        : `${newStart},${newLines}`;
  return `@@ -${o} +${n} @@`;
}

/** 将 hunk 视为 disk→goal 的变换；取逆后应用到 goal 可去掉该片段（用于「拒绝」单段） */
function invertDiffHunk(h: DiffHunk): DiffHunk {
  const flipped = h.rawLines.map((line) => {
    if (line.startsWith("+")) return `-${line.slice(1)}`;
    if (line.startsWith("-")) return `+${line.slice(1)}`;
    return line;
  });
  return {
    index: h.index,
    rawHeader: formatUnifiedHunkHeader(
      h.newStart,
      h.newLines,
      h.oldStart,
      h.oldLines
    ),
    rawLines: flipped,
    oldStart: h.newStart,
    oldLines: h.newLines,
    newStart: h.oldStart,
    newLines: h.oldLines,
  };
}

function diffHunksDiskToGoal(disk: string, goal: string, pathLabel: string): DiffHunk[] {
  const d = normalizeSparkText(disk);
  const g = normalizeSparkText(goal);
  const unified = createTwoFilesPatch(pathLabel, pathLabel, d, g, "", "");
  const hunks = parseUnifiedDiff(unified);
  hunks.forEach((h, i) => {
    h.index = i;
  });
  return hunks;
}

/** 单文件 unified 片段，供 applyPatch（支持 fuzz） */
function singleHunkUnifiedPatch(relPath: string, h: DiffHunk): string {
  const name = relPath.replace(/\\/g, "/");
  const body = `${h.rawHeader}\n${h.rawLines.join("\n")}`;
  return `--- a/${name}\n+++ b/${name}\n${body}\n`;
}

function rehydrateTrailingNewline(before: string, afterNorm: string): string {
  const hadTrailing = normalizeSparkText(before).endsWith("\n");
  let r = afterNorm;
  if (hadTrailing && !r.endsWith("\n")) r = `${r}\n`;
  return r;
}

const PATCH_APPLY_FUZZ = 8;

/**
 * 将 disk 上的一段 hunk 应用为更接近 goal 的中间结果；优先用 diff.applyPatch（模糊匹配），失败再回退 applyHunksToText。
 */
function applyOneHunkToDisk(disk: string, relPath: string, h: DiffHunk): string {
  const norm = normalizeSparkText(disk);
  const uni = singleHunkUnifiedPatch(relPath, h);
  const patched = applyPatch(norm, uni, {
    fuzzFactor: PATCH_APPLY_FUZZ,
    autoConvertLineEndings: true,
  });
  if (typeof patched === "string") {
    return rehydrateTrailingNewline(disk, patched);
  }
  try {
    return rehydrateTrailingNewline(disk, applyHunksToText(norm, [h]));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${msg}（若仍失败，请用顶部「选择全部」一次写入完整目标文件）`
    );
  }
}

function applyOneHunkToText(base: string, relPath: string, h: DiffHunk): string {
  const norm = normalizeSparkText(base);
  const uni = singleHunkUnifiedPatch(relPath, h);
  const patched = applyPatch(norm, uni, {
    fuzzFactor: PATCH_APPLY_FUZZ,
    autoConvertLineEndings: true,
  });
  if (typeof patched === "string") {
    return rehydrateTrailingNewline(base, patched);
  }
  try {
    return rehydrateTrailingNewline(base, applyHunksToText(norm, [h]));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${msg}（拒绝该片段时无法对齐上下文，可改用「拒绝全部」）`);
  }
}

const GAME_COVER_CANDIDATES = [
  "cover.png",
  "cover.jpg",
  "cover.webp",
  "preview.png",
  "preview.jpg",
  "thumb.png",
  "poster.jpg",
  "icon.png",
];

function prettifyGameSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function readGameTitleFromIndexHtml(gameRoot: string): string | null {
  try {
    const html = fs.readFileSync(pathMod.join(gameRoot, "index.html"), "utf8");
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (m) {
      const t = m[1].replace(/\s+/g, " ").trim();
      if (t) return t;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function firstExistingCoverRel(gameRoot: string): string | null {
  for (const name of GAME_COVER_CANDIDATES) {
    const full = pathMod.join(gameRoot, name);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return name.replace(/\\/g, "/");
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export interface GameCatalogEntry {
  slug: string;
  title: string;
  /** 相对游戏根目录的封面路径，无则为 null（前端用占位图） */
  cover: string | null;
}

/** 供 /spark 游戏选择器：标题来自 game.json、index.html 的 title、或美化后的目录名 */
function listGameCatalog(gamesParent: string): GameCatalogEntry[] {
  const slugs = listGameSlugs(gamesParent);
  return slugs.map((slug) => {
    const gameRoot = pathMod.resolve(gamesParent, slug);
    const pretty = prettifyGameSlug(slug);
    let title = pretty;
    let cover: string | null = null;

    try {
      const manifestPath = pathMod.join(gameRoot, "game.json");
      if (fs.existsSync(manifestPath)) {
        const raw = fs.readFileSync(manifestPath, "utf8");
        const j = JSON.parse(raw) as { title?: unknown; cover?: unknown };
        if (typeof j.title === "string" && j.title.trim()) {
          title = j.title.trim();
        }
        if (typeof j.cover === "string" && j.cover.trim()) {
          const rel = j.cover.trim().replace(/^[/\\]+/, "").replace(/\\/g, "/");
          if (!rel.includes("..")) {
            const full = pathMod.resolve(gameRoot, rel);
            if (isPathInsideRoot(full, gameRoot)) {
              try {
                if (fs.existsSync(full) && fs.statSync(full).isFile()) {
                  cover = rel;
                }
              } catch {
                /* ignore */
              }
            }
          }
        }
      }
    } catch {
      /* ignore bad json */
    }

    const fromIndex = readGameTitleFromIndexHtml(gameRoot);
    if (fromIndex && title === pretty) {
      title = fromIndex;
    }

    if (!cover) {
      cover = firstExistingCoverRel(gameRoot);
    }

    return { slug, title, cover };
  });
}

function handleSparkSave(
  req: IncomingMessage,
  res: ServerResponse,
  gamesParent: string
): void {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (c: Buffer) => {
    size += c.length;
    if (size > SAVE_MAX_BYTES) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
      const raw = Buffer.concat(chunks).toString("utf-8");
      const body = JSON.parse(raw) as { game?: string; path?: string; content?: string };
      const gameSlug = normalizeGameSlug(body.game || "default");
      const gameRoot = pathMod.resolve(gamesParent, gameSlug);
      const rel = (body.path || "").trim().replace(/^[/\\]+/, "");
      if (!rel || rel.includes("..")) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "invalid path" }));
        return;
      }
      if (!isSparkUserEditableRel(rel)) {
        res.writeHead(403);
        res.end(
          JSON.stringify({
            ok: false,
            error:
              "预览仅允许保存游戏向文件（html/js/css/json/txt/svg 等），不开放工程脚手架与 TypeScript 源",
          })
        );
        return;
      }
      const full = pathMod.resolve(gameRoot, rel);
      if (!isPathInsideRoot(full, gameRoot)) {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, error: "forbidden" }));
        return;
      }
      const dir = pathMod.dirname(full);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(full, body.content ?? "", "utf-8");
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500);
      res.end(
        JSON.stringify({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        })
      );
    }
  });
}

export function startPreviewServer(
  gameDir: string,
  port = 4321
): PreviewServer {
  const initialGameRoot = pathMod.resolve(gameDir);
  const gamesParent = pathMod.dirname(initialGameRoot);
  const initialGame = pathMod.basename(initialGameRoot);
  let draftState: { path: string; content: string; isDiff?: boolean; note?: string } | null = null;
  type SparkQueuedPatch = {
    id: string;
    path: string;
    diff: string;
    /** 采纳全部片段后的目标全文；拒绝片段时会缩短 */
    goalContent: string;
  };
  const pendingPatches = new Map<string, SparkQueuedPatch[]>();

  const server = http.createServer((req, res) => {
    const method = req.method || "GET";
    const rawUrl = req.url || "/";
    const q = rawUrl.indexOf("?");
    let pathname = decodeURIComponent(q >= 0 ? rawUrl.slice(0, q) : rawUrl);
    // 避免 /__spark/.../ 未命中严格相等而落到静态逻辑、误返回游戏 index.html
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    const search = q >= 0 ? rawUrl.slice(q + 1) : "";
    const searchParams = new URLSearchParams(search);
    const gamePathPrefix = "/__spark/game/";
    const pathGameMatch = pathname.startsWith(gamePathPrefix)
      ? pathname.slice(gamePathPrefix.length).match(/^([^/]+)(\/.*)?$/)
      : null;
    const pathGame = pathGameMatch?.[1]
      ? normalizeGameSlug(pathGameMatch[1])
      : null;
    const currentGame = pathGame ?? normalizeGameSlug(searchParams.get("game") || initialGame);
    const gameRoot = pathMod.resolve(gamesParent, currentGame);
    const nohmr = searchParams.get("nohmr") === "1";

    if (pathname === "/__spark/meta") {
      if (method === "GET") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(200);
        res.end(
          JSON.stringify({
            gameRoot,
            games: listGameSlugs(gamesParent),
            catalog: listGameCatalog(gamesParent),
            currentGame,
          })
        );
        return;
      }
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    if (pathname === "/__spark/games") {
      if (method === "GET") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(200);
        res.end(
          JSON.stringify({
            games: listGameSlugs(gamesParent),
            catalog: listGameCatalog(gamesParent),
            currentGame,
          })
        );
        return;
      }
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    if (pathname === "/__spark/list") {
      if (method === "GET") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        try {
          const files = listSparkProjectFiles(gameRoot);
          if (
            files.length === 0 &&
            fs.existsSync(pathMod.join(gameRoot, "index.html"))
          ) {
            files.push("index.html");
          }
          res.writeHead(200);
          res.end(JSON.stringify({ files }));
        } catch (e) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : String(e),
              files: [],
            })
          );
        }
        return;
      }
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }

    if (pathname === "/__spark/save") {
      if (method === "POST") {
        handleSparkSave(req, res, gamesParent);
        return;
      }
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }

    if (pathname === "/__spark/patch") {
      if (method === "GET") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        const gameSlug = currentGame;
        const queue = pendingPatches.get(gameSlug) || [];
        const gameRootBySlug = pathMod.resolve(gamesParent, gameSlug);
        while (queue.length > 0) {
          const head = queue[0];
          const full = pathMod.resolve(gameRootBySlug, head.path);
          if (!isPathInsideRoot(full, gameRootBySlug)) break;
          const disk = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
          if (normalizeSparkText(disk) === normalizeSparkText(head.goalContent)) {
            queue.shift();
            broadcast({ type: "patch", game: gameSlug, count: queue.length });
            broadcast({ type: "reload", game: gameSlug });
          } else {
            break;
          }
        }
        pendingPatches.set(gameSlug, queue);
        const next = queue[0] || null;
        let payload: Record<string, unknown> | null = null;
        if (next) {
          const full = pathMod.resolve(gameRootBySlug, next.path);
          const disk = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
          let hunks: DiffHunk[] = [];
          try {
            hunks = diffHunksDiskToGoal(disk, next.goalContent, next.path);
          } catch {
            hunks = [];
          }
          payload = {
            id: next.id,
            path: next.path,
            goalContent: next.goalContent,
            hunks,
          };
        }
        res.writeHead(200);
        res.end(JSON.stringify({ patch: payload, count: queue.length }));
        return;
      }
      if (method === "POST") {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (c: Buffer) => {
          size += c.length;
          if (size > SAVE_MAX_BYTES) {
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        req.on("end", () => {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          try {
            const raw = Buffer.concat(chunks).toString("utf-8");
            const body = JSON.parse(raw) as { game?: string; path?: string; diff?: string };
            const gameSlug = normalizeGameSlug(body.game || currentGame);
            const rel = (body.path || "").trim().replace(/^[/\\]+/, "");
            if (!rel || rel.includes("..")) {
              res.writeHead(400);
              res.end(JSON.stringify({ ok: false, error: "invalid path" }));
              return;
            }
            if (!isSparkUserEditableRel(rel)) {
              res.writeHead(403);
              res.end(JSON.stringify({ ok: false, error: "forbidden path" }));
              return;
            }
            const diff = String(body.diff || "");
            const hunks = parseUnifiedDiff(diff);
            if (hunks.length === 0) {
              res.writeHead(400);
              res.end(JSON.stringify({ ok: false, error: "invalid unified diff" }));
              return;
            }
            const gameRootBySlug = pathMod.resolve(gamesParent, gameSlug);
            const full = pathMod.resolve(gameRootBySlug, rel);
            if (!isPathInsideRoot(full, gameRootBySlug)) {
              res.writeHead(403);
              res.end(JSON.stringify({ ok: false, error: "forbidden" }));
              return;
            }
            const original = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
            let goalContent: string;
            try {
              goalContent = normalizeSparkText(
                applyHunksToText(normalizeSparkText(original), hunks)
              );
            } catch (e) {
              res.writeHead(400);
              res.end(
                JSON.stringify({
                  ok: false,
                  error: e instanceof Error ? e.message : "diff does not apply to current file",
                })
              );
              return;
            }
            const patch: SparkQueuedPatch = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
              path: rel,
              diff,
              goalContent,
            };
            const queue = pendingPatches.get(gameSlug) || [];
            queue.push(patch);
            pendingPatches.set(gameSlug, queue);
            broadcast({ type: "patch", game: gameSlug, count: queue.length });
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, patch }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              })
            );
          }
        });
        return;
      }
      res.writeHead(405, { Allow: "GET, POST" });
      res.end();
      return;
    }

    if (pathname === "/__spark/patch/apply-hunk" || pathname === "/__spark/patch/reject-hunk") {
      if (method !== "POST") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(405, { Allow: "POST" });
        res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          const body = JSON.parse(raw) as { game?: string; id?: string; hunkIndex?: number };
          const gameSlug = normalizeGameSlug(body.game || currentGame);
          const queue = pendingPatches.get(gameSlug) || [];
          const pidx = queue.findIndex((p) => p.id === body.id);
          if (pidx < 0) {
            res.writeHead(404);
            res.end(JSON.stringify({ ok: false, error: "patch not found" }));
            return;
          }
          const patch = queue[pidx];
          if (!isSparkUserEditableRel(patch.path)) {
            res.writeHead(403);
            res.end(JSON.stringify({ ok: false, error: "forbidden path" }));
            return;
          }
          const gameRootBySlug = pathMod.resolve(gamesParent, gameSlug);
          const full = pathMod.resolve(gameRootBySlug, patch.path);
          if (!isPathInsideRoot(full, gameRootBySlug)) {
            res.writeHead(403);
            res.end(JSON.stringify({ ok: false, error: "forbidden" }));
            return;
          }
          const disk = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
          let hunks: DiffHunk[];
          try {
            hunks = diffHunksDiskToGoal(disk, patch.goalContent, patch.path);
          } catch (e) {
            res.writeHead(400);
            res.end(
              JSON.stringify({
                ok: false,
                error: e instanceof Error ? e.message : "diff failed",
              })
            );
            return;
          }
          const hi = Number(body.hunkIndex ?? 0);
          if (!Number.isFinite(hi) || hi < 0 || hi >= hunks.length) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: "bad hunk index" }));
            return;
          }
          const H = hunks[hi];
          const isApplyHunk = pathname === "/__spark/patch/apply-hunk";
          if (isApplyHunk) {
            let disk2: string;
            try {
              disk2 = applyOneHunkToDisk(disk, patch.path, H);
            } catch (e) {
              res.writeHead(400);
              res.end(
                JSON.stringify({
                  ok: false,
                  error: e instanceof Error ? e.message : String(e),
                })
              );
              return;
            }
            const goalNorm = normalizeSparkText(patch.goalContent);
            fs.mkdirSync(pathMod.dirname(full), { recursive: true });
            fs.writeFileSync(full, disk2, "utf8");
            if (normalizeSparkText(disk2) === goalNorm) {
              queue.splice(pidx, 1);
            }
          } else {
            const inv = invertDiffHunk(H);
            try {
              patch.goalContent = applyOneHunkToText(patch.goalContent, patch.path, inv);
            } catch (e) {
              res.writeHead(400);
              res.end(
                JSON.stringify({
                  ok: false,
                  error: e instanceof Error ? e.message : String(e),
                })
              );
              return;
            }
            if (normalizeSparkText(disk) === normalizeSparkText(patch.goalContent)) {
              queue.splice(pidx, 1);
            }
          }
          pendingPatches.set(gameSlug, queue);
          broadcast({ type: "patch", game: gameSlug, count: queue.length });
          broadcast({ type: "reload", game: gameSlug });
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            })
          );
        }
      });
      return;
    }

    if (pathname === "/__spark/patch/apply" || pathname === "/__spark/patch/reject") {
      if (method !== "POST") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(405, { Allow: "POST" });
        res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          const body = JSON.parse(raw) as { game?: string; id?: string };
          const gameSlug = normalizeGameSlug(body.game || currentGame);
          const queue = pendingPatches.get(gameSlug) || [];
          const idx = queue.findIndex((p) => p.id === body.id);
          if (idx < 0) {
            res.writeHead(404);
            res.end(JSON.stringify({ ok: false, error: "patch not found" }));
            return;
          }
          const patch = queue[idx];
          const isApply = pathname === "/__spark/patch/apply";
          if (isApply) {
            if (!isSparkUserEditableRel(patch.path)) {
              res.writeHead(403);
              res.end(JSON.stringify({ ok: false, error: "forbidden path" }));
              return;
            }
            const gameRootBySlug = pathMod.resolve(gamesParent, gameSlug);
            const full = pathMod.resolve(gameRootBySlug, patch.path);
            if (!isPathInsideRoot(full, gameRootBySlug)) {
              res.writeHead(403);
              res.end(JSON.stringify({ ok: false, error: "forbidden" }));
              return;
            }
            fs.mkdirSync(pathMod.dirname(full), { recursive: true });
            fs.writeFileSync(full, normalizeSparkText(patch.goalContent), "utf8");
          }
          queue.splice(idx, 1);
          pendingPatches.set(gameSlug, queue);
          broadcast({ type: "patch", game: gameSlug, count: queue.length });
          if (isApply) {
            broadcast({ type: "reload", game: gameSlug });
          }
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            })
          );
        }
      });
      return;
    }

    if (pathname.startsWith("/__spark/vendor/monaco/")) {
      const rel = pathname
        .slice("/__spark/vendor/monaco/".length)
        .replace(/^[/\\]+/, "");
      if (!rel || rel.includes("..")) {
        res.writeHead(400);
        res.end("Bad path");
        return;
      }
      const full = pathMod.resolve(MONACO_LOCAL_MIN, rel);
      if (!isPathInsideRoot(full, MONACO_LOCAL_MIN)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const mime = lookup(full) || "application/octet-stream";
      res.writeHead(200, { "Content-Type": `${mime}; charset=utf-8` });
      res.end(fs.readFileSync(full));
      return;
    }

    if (pathname === "/__spark/app.js") {
      if (!fs.existsSync(PREVIEW_APP_BUNDLE)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(
          "preview-app bundle missing. Run: pnpm --dir cli run build:preview-app"
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(fs.readFileSync(PREVIEW_APP_BUNDLE, "utf-8"));
      return;
    }

    if (pathname === "/spark" || pathname === "/spark/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (fs.existsSync(PREVIEW_APP_BUNDLE)) {
        res.end(splitReactShellHtml(port, currentGame));
      } else {
        res.end(splitShellHtml(port, currentGame));
      }
      return;
    }

    if (pathname.startsWith("/__spark/raw/")) {
      const rel = pathname.slice("/__spark/raw/".length).replace(/^[/\\]+/, "");
      if (!rel || rel.includes("..")) {
        res.writeHead(400);
        res.end("Bad path");
        return;
      }
      const full = pathMod.resolve(gameRoot, rel);
      if (!isPathInsideRoot(full, gameRoot)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (!isSparkUserEditableRel(rel)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(fs.readFileSync(full, "utf-8"));
      return;
    }

    /** 其余 /__spark/*（不含已处理的 API 与 /__spark/game/ 静态）勿回退为游戏 index.html */
    if (pathname.startsWith("/__spark/") && !pathname.startsWith("/__spark/game/")) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: false,
          error:
            "预览服务不识别的 __spark 路径（升级后请执行: pnpm --dir cli run build && 重启 spark preview）",
          path: pathname,
        })
      );
      return;
    }

    const staticPath = pathGameMatch
      ? pathGameMatch[2] || "/index.html"
      : pathname === "/"
        ? "/index.html"
        : pathname;
    const relative = staticPath.replace(/^[/\\]+/, "");
    if (isSparkStaticHttpBlocked(relative)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const filePath = pathMod.join(gameRoot, relative);

    if (!isPathInsideRoot(filePath, gameRoot)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const indexPath = pathMod.join(gameRoot, "index.html");
      if (fs.existsSync(indexPath)) {
        serveFile(indexPath, res, port, !nohmr);
      } else {
        res.writeHead(404);
        res.end("Not Found - 请先生成游戏代码");
      }
      return;
    }

    serveFile(filePath, res, port, !nohmr);
  });

  const wss = new WebSocketServer({ server });

  function broadcast(payload: unknown): void {
    const message = JSON.stringify(payload);
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }

  let debounceTimer: ReturnType<typeof setTimeout>;
  const watcher = watch(gamesParent, {
    ignoreInitial: true,
    ignored: /(^|[/\\])\./,
  });

  watcher.on("all", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      broadcast({ type: "reload" });
    }, 200);
  });

  server.once("error", (err: NodeJS.ErrnoException) => {
    try {
      watcher.close();
    } catch {
      /* ignore */
    }
    try {
      wss.close();
    } catch {
      /* ignore */
    }
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n[spark] 端口 ${port} 已被占用。\n` +
        `  • 若已在运行 spark preview 或 spark game，直接打开 http://localhost:${port}/spark\n` +
        `  • 要再起一个预览请换端口：spark preview -p 4322\n` +
        `  • 查看占用（macOS）：lsof -nP -iTCP:${port} -sTCP:LISTEN\n`
      );
    } else {
      console.error("\n[spark] 预览服务监听失败:", err.message);
    }
    process.exit(1);
  });

  server.listen(port);

  return {
    port,
    setDraft: (draft) => {
      draftState = draft;
      broadcast({
        type: "draft",
        payload: draftState,
      });
    },
    close: () => {
      watcher.close();
      wss.close();
      server.close();
    },
  };
}

function serveFile(
  filePath: string,
  res: ServerResponse,
  wsPort: number,
  injectHmr: boolean
): void {
  const mime = lookup(filePath) || "application/octet-stream";
  let content = fs.readFileSync(filePath);

  if (filePath.endsWith(".html") && injectHmr) {
    const hmrScript = `\n<script>
(function(){
  var ws = new WebSocket("ws://" + location.hostname + ":" + ${wsPort} + "");
  ws.onmessage = function() { location.reload(); };
  ws.onclose = function() {
    setTimeout(function() { location.reload(); }, 2000);
  };
})();
</script>`;
    const html = content.toString("utf-8");
    if (html.includes("</body>")) {
      content = Buffer.from(html.replace("</body>", hmrScript + "\n</body>"));
    } else {
      content = Buffer.from(html + hmrScript);
    }
  }

  res.writeHead(200, { "Content-Type": mime });
  res.end(content);
}
