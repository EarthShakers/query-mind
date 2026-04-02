import fs from "node:fs";
import pathMod from "node:path";
import http from "node:http";
import { WebSocketServer } from "ws";
import { watch } from "chokidar";
import { lookup } from "mime-types";
import { normalizeGameSlug } from "./game-root.js";
function listGameSlugs(gamesParent) {
    try {
        return fs
            .readdirSync(gamesParent, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
            .map((entry) => normalizeGameSlug(entry.name))
            .sort((a, b) => a.localeCompare(b));
    }
    catch {
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
function sparkBasenameLower(rel) {
    const norm = rel.replace(/\\/g, "/");
    const seg = norm.split("/").pop() || "";
    return seg.toLowerCase();
}
function isSparkDenyBasenameLower(baseLower) {
    if (SPARK_DENY_BASENAME_LOWER.has(baseLower))
        return true;
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
function isSparkUserEditableRel(rel) {
    const norm = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!norm || norm.includes(".."))
        return false;
    const baseLower = sparkBasenameLower(norm);
    if (isSparkDenyBasenameLower(baseLower))
        return false;
    const ext = pathMod.extname(baseLower).toLowerCase();
    return SPARK_USER_EDIT_EXT.has(ext);
}
/** 是否禁止通过普通静态 GET 暴露（iframe 拉游戏资源时仍可读图片/字体等） */
function isSparkStaticHttpBlocked(relativeUrlPath) {
    const norm = relativeUrlPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!norm)
        return false;
    const baseLower = sparkBasenameLower(norm);
    if (isSparkDenyBasenameLower(baseLower))
        return true;
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
function listSparkProjectFiles(root) {
    const out = [];
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
    function walk(dir, relPrefix) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const ent of entries) {
            if (ent.name.startsWith("."))
                continue;
            if (ignore.has(ent.name))
                continue;
            const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
            const full = pathMod.join(dir, ent.name);
            if (ent.isDirectory()) {
                walk(full, rel);
            }
            else {
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
const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min";
function splitShellHtml(port, initialGame) {
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
        <textarea id="editor-fallback" spellcheck="false" class="fallback-visible"></textarea>
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

  try {
    var ws = new WebSocket("ws://" + location.hostname + ":" + port);
    ws.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data);
        if (data && data.type === "draft") {
          if (data.payload && data.payload.path) {
            draftState = data.payload;
            if (!currentFile || currentFile === "index.html" || currentFile === draftState.path) {
              currentFile = draftState.path;
              pathEl.textContent = currentFile;
              updateUrl();
              highlightTreeActive();
              applyDraftToEditor();
            }
          } else {
            draftState = null;
            btnSave.disabled = false;
            setStatus("草稿已完成，已切回真实文件", true);
            fetchFileList().then(function () {
              return loadSourceDisk();
            }).then(function () {
              bumpIframe();
            });
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
function isPathInsideRoot(filePath, root) {
    const resolved = pathMod.resolve(filePath);
    const rootResolved = pathMod.resolve(root);
    return resolved === rootResolved || resolved.startsWith(rootResolved + pathMod.sep);
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
function prettifyGameSlug(slug) {
    return slug
        .split(/[-_]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}
function readGameTitleFromIndexHtml(gameRoot) {
    try {
        const html = fs.readFileSync(pathMod.join(gameRoot, "index.html"), "utf8");
        const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (m) {
            const t = m[1].replace(/\s+/g, " ").trim();
            if (t)
                return t;
        }
    }
    catch {
        /* ignore */
    }
    return null;
}
function firstExistingCoverRel(gameRoot) {
    for (const name of GAME_COVER_CANDIDATES) {
        const full = pathMod.join(gameRoot, name);
        try {
            if (fs.existsSync(full) && fs.statSync(full).isFile()) {
                return name.replace(/\\/g, "/");
            }
        }
        catch {
            /* ignore */
        }
    }
    return null;
}
/** 供 /spark 游戏选择器：标题来自 game.json、index.html 的 title、或美化后的目录名 */
function listGameCatalog(gamesParent) {
    const slugs = listGameSlugs(gamesParent);
    return slugs.map((slug) => {
        const gameRoot = pathMod.resolve(gamesParent, slug);
        const pretty = prettifyGameSlug(slug);
        let title = pretty;
        let cover = null;
        try {
            const manifestPath = pathMod.join(gameRoot, "game.json");
            if (fs.existsSync(manifestPath)) {
                const raw = fs.readFileSync(manifestPath, "utf8");
                const j = JSON.parse(raw);
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
                            }
                            catch {
                                /* ignore */
                            }
                        }
                    }
                }
            }
        }
        catch {
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
function handleSparkSave(req, res, gamesParent) {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
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
            const body = JSON.parse(raw);
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
                res.end(JSON.stringify({
                    ok: false,
                    error: "预览仅允许保存游戏向文件（html/js/css/json/txt/svg 等），不开放工程脚手架与 TypeScript 源",
                }));
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
        }
        catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({
                ok: false,
                error: e instanceof Error ? e.message : String(e),
            }));
        }
    });
}
export function startPreviewServer(gameDir, port = 4321) {
    const initialGameRoot = pathMod.resolve(gameDir);
    const gamesParent = pathMod.dirname(initialGameRoot);
    const initialGame = pathMod.basename(initialGameRoot);
    let draftState = null;
    const server = http.createServer((req, res) => {
        const method = req.method || "GET";
        const rawUrl = req.url || "/";
        const q = rawUrl.indexOf("?");
        const pathname = decodeURIComponent(q >= 0 ? rawUrl.slice(0, q) : rawUrl);
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
                res.end(JSON.stringify({
                    gameRoot,
                    games: listGameSlugs(gamesParent),
                    catalog: listGameCatalog(gamesParent),
                    currentGame,
                }));
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
                res.end(JSON.stringify({
                    games: listGameSlugs(gamesParent),
                    catalog: listGameCatalog(gamesParent),
                    currentGame,
                }));
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
                    res.writeHead(200);
                    res.end(JSON.stringify({ files }));
                }
                catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({
                        error: e instanceof Error ? e.message : String(e),
                        files: [],
                    }));
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
        if (pathname === "/spark" || pathname === "/spark/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(splitShellHtml(port, currentGame));
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
            }
            else {
                res.writeHead(404);
                res.end("Not Found - 请先生成游戏代码");
            }
            return;
        }
        serveFile(filePath, res, port, !nohmr);
    });
    const wss = new WebSocketServer({ server });
    function broadcast(payload) {
        const message = JSON.stringify(payload);
        wss.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(message);
            }
        });
    }
    let debounceTimer;
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
    server.once("error", (err) => {
        try {
            watcher.close();
        }
        catch {
            /* ignore */
        }
        try {
            wss.close();
        }
        catch {
            /* ignore */
        }
        if (err.code === "EADDRINUSE") {
            console.error(`\n[spark] 端口 ${port} 已被占用。\n` +
                `  • 若已在运行 spark preview 或 spark game，直接打开 http://localhost:${port}/spark\n` +
                `  • 要再起一个预览请换端口：spark preview -p 4322\n` +
                `  • 查看占用（macOS）：lsof -nP -iTCP:${port} -sTCP:LISTEN\n`);
        }
        else {
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
function serveFile(filePath, res, wsPort, injectHmr) {
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
        }
        else {
            content = Buffer.from(html + hmrScript);
        }
    }
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
}
