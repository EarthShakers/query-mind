import fs from "node:fs";
import pathMod from "node:path";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { watch } from "chokidar";
import { lookup } from "mime-types";
import { normalizeGameSlug } from "./game-root.js";

export interface PreviewServer {
  port: number;
  close: () => void;
  setDraft: (draft: { path: string; content: string; note?: string } | null) => void;
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
    select {
      background: #111827; color: #e5e7eb; border: 1px solid #374151;
      border-radius: 8px; padding: 6px 10px; font-size: 13px;
    }
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
    <select id="game-select"></select>
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
  var gameSelectEl = document.getElementById("game-select");
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
  gameSelectEl.value = currentGame;

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
        gameSelectEl.innerHTML = "";
        games.forEach(function (slug) {
          var opt = document.createElement("option");
          opt.value = slug;
          opt.textContent = slug;
          if (slug === currentGame) opt.selected = true;
          gameSelectEl.appendChild(opt);
        });
        if (games.length && games.indexOf(currentGame) < 0) {
          currentGame = games[0];
          gameSelectEl.value = currentGame;
        }
      })
      .catch(function () {});
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
  gameSelectEl.addEventListener("change", function () {
    currentGame = gameSelectEl.value || ${JSON.stringify(initialGame)};
    currentFile = "index.html";
    draftState = null;
    lastLoadedGame = null;
    btnSave.disabled = false;
    pathEl.textContent = currentFile;
    updateUrl();
    fetchFileList().then(function () {
      return openFile(currentFile);
    }).then(function () {
      bumpIframe();
    });
  });
  btnRefreshTree.addEventListener("click", function () {
    fetchFileList().then(function () {
      return openFile(currentFile, true);
    });
  });
  document.addEventListener("keydown", function (e) {
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

function isPathInsideRoot(filePath: string, root: string): boolean {
  const resolved = pathMod.resolve(filePath);
  const rootResolved = pathMod.resolve(root);
  return resolved === rootResolved || resolved.startsWith(rootResolved + pathMod.sep);
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
  let draftState: { path: string; content: string; note?: string } | null = null;

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
        res.end(
          JSON.stringify({
            gameRoot,
            games: listGameSlugs(gamesParent),
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
