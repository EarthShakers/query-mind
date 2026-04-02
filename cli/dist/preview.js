import fs from "node:fs";
import pathMod from "node:path";
import http from "node:http";
import { WebSocketServer } from "ws";
import { watch } from "chokidar";
import { lookup } from "mime-types";
const SAVE_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_SAVE_EXT = new Set([
    ".html",
    ".htm",
    ".js",
    ".mjs",
    ".cjs",
    ".css",
    ".json",
    ".ts",
    ".tsx",
    ".jsx",
    ".md",
    ".txt",
    ".svg",
    ".xml",
]);
const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min";
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
                const ext = pathMod.extname(ent.name).toLowerCase();
                if (ALLOWED_SAVE_EXT.has(ext)) {
                    out.push(rel.replace(/\\/g, "/"));
                }
            }
        }
    }
    walk(pathMod.resolve(root), "");
    out.sort((a, b) => a.localeCompare(b));
    return out;
}
function splitShellHtml(port) {
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
    main { flex: 1; display: flex; min-height: 0; }
    #pane-code { flex: 1; min-width: 0; display: flex; flex-direction: row; border-right: 1px solid #2a2a2a; }
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
    #editor-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
    #editor { flex: 1; width: 100%; min-height: 0; }
    #pane-preview { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #111; }
    #pane-preview iframe { flex: 1; width: 100%; border: 0; background: #1a1a1a; }
    .label { font-weight: 600; letter-spacing: 0.02em; }
  </style>
</head>
<body>
  <header>
    <span class="label">spark</span>
    <span id="file-path">index.html</span>
    <span class="grow"></span>
    <button type="button" class="secondary" id="btn-refresh-tree">刷新列表</button>
    <button type="button" id="btn-save">保存 (Ctrl+S)</button>
    <span id="status" class="hint"></span>
    <span class="hint">Monaco 多文件；右侧为运行效果</span>
  </header>
  <main>
    <div id="pane-code">
      <div id="file-sidebar">
        <div class="side-head">项目文件</div>
        <div id="file-tree"></div>
      </div>
      <div id="editor-wrap">
        <div id="editor"></div>
      </div>
    </div>
    <div id="pane-preview">
      <iframe id="game" title="game" src="/index.html?nohmr=1"></iframe>
    </div>
  </main>
  <script src="${MONACO_CDN}/vs/loader.js"></script>
  <script>
(function () {
  var port = ${port};
  var MON_BASE = "${MONACO_CDN}";
  var params = new URLSearchParams(location.search);
  var currentFile = params.get("file") || "index.html";

  var iframe = document.getElementById("game");
  var statusEl = document.getElementById("status");
  var btnSave = document.getElementById("btn-save");
  var btnRefreshTree = document.getElementById("btn-refresh-tree");
  var fileTreeEl = document.getElementById("file-tree");
  var pathEl = document.getElementById("file-path");
  var dirty = false;
  var editor = null;
  var models = new Map();

  pathEl.textContent = currentFile;

  self.MonacoEnvironment = {
    getWorkerUrl: function (_moduleId, label) {
      var b = MON_BASE + "/vs";
      if (label === "json") return b + "/language/json/json.worker.js";
      if (label === "css" || label === "scss" || label === "less") return b + "/language/css/css.worker.js";
      if (label === "html" || label === "handlebars" || label === "razor") return b + "/language/html/html.worker.js";
      if (label === "typescript" || label === "javascript") return b + "/language/typescript/ts.worker.js";
      return b + "/editor/editor.worker.js";
    }
  };

  require.config({ paths: { vs: MON_BASE + "/vs" } });

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

  function setStatus(msg, ok) {
    statusEl.textContent = msg;
    statusEl.className = ok ? "ok" : "err";
  }

  function bumpIframe() {
    iframe.src = "/index.html?nohmr=1&t=" + Date.now();
  }

  function rawUrl(rel) {
    var parts = rel.split("/").filter(Boolean);
    return "/__spark/raw/" + parts.map(encodeURIComponent).join("/");
  }

  function uriFor(rel) {
    return monaco.Uri.parse("spark://" + rel.split("/").map(encodeURIComponent).join("/"));
  }

  function getOrCreateModel(rel, text) {
    var u = uriFor(rel);
    var existing = monaco.editor.getModel(u);
    if (existing) {
      return existing;
    }
    return monaco.editor.createModel(text || "", languageForPath(rel), u);
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

  function fetchFileList() {
    return fetch("/__spark/list")
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (j) {
        var files = j.files || [];
        renderFileList(files);
        if (files.length && files.indexOf(currentFile) < 0) {
          currentFile = files[0];
          pathEl.textContent = currentFile;
          history.replaceState(null, "", "?file=" + encodeURIComponent(currentFile));
        }
      })
      .catch(function () {
        fileTreeEl.textContent = "无法加载列表";
      });
  }

  function openFile(rel) {
    if (rel === currentFile && editor) return;
    if (dirty && editor) {
      if (!confirm("当前文件未保存，切换将丢失修改。是否继续？")) return;
    }
    currentFile = rel;
    pathEl.textContent = currentFile;
    history.replaceState(null, "", "?file=" + encodeURIComponent(currentFile));
    highlightTreeActive();
    return fetch(rawUrl(currentFile))
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(function (text) {
        var model = getOrCreateModel(currentFile, text);
        models.set(currentFile, model);
        editor.setModel(model);
        dirty = false;
        setStatus("", true);
      })
      .catch(function () {
        var model = getOrCreateModel(currentFile, "<!-- 文件不存在，保存将创建 -->");
        models.set(currentFile, model);
        editor.setModel(model);
        dirty = true;
      });
  }

  function loadSourceDisk() {
    if (!editor) return Promise.resolve();
    return fetch(rawUrl(currentFile))
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(function (text) {
        if (dirty) {
          if (!confirm("磁盘上的文件已变化，是否放弃未保存修改并重新加载？")) return;
        }
        var m = editor.getModel();
        if (m) {
          m.setValue(text);
        }
        dirty = false;
        setStatus("", true);
      })
      .catch(function () {});
  }

  function save() {
    if (!editor) return;
    btnSave.disabled = true;
    setStatus("保存中…", true);
    var content = editor.getValue();
    fetch("/__spark/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: currentFile, content: content }),
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

  require(["vs/editor/editor.main"], function () {
    monaco.editor.defineTheme("spark-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0d0d0d",
      },
    });
    monaco.editor.setTheme("spark-dark");
    editor = monaco.editor.create(document.getElementById("editor"), {
      model: null,
      fontSize: 13,
      wordWrap: "on",
      minimap: { enabled: false },
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
    });
    editor.onDidChangeModelContent(function () {
      dirty = true;
      statusEl.textContent = "";
      statusEl.className = "hint";
    });

    btnSave.addEventListener("click", save);
    btnRefreshTree.addEventListener("click", fetchFileList);
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    });

    fetchFileList().then(function () {
      return openFile(currentFile);
    });

    try {
      var ws = new WebSocket("ws://" + location.hostname + ":" + port);
      ws.onmessage = function () {
        fetchFileList();
        loadSourceDisk().then(function () {
          bumpIframe();
        });
      };
    } catch (e) {}

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        fetchFileList();
        loadSourceDisk();
      }
    });
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
function handleSparkSave(req, res, gameRoot) {
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
            const rel = (body.path || "").trim().replace(/^[/\\]+/, "");
            if (!rel || rel.includes("..")) {
                res.writeHead(400);
                res.end(JSON.stringify({ ok: false, error: "invalid path" }));
                return;
            }
            const ext = pathMod.extname(rel).toLowerCase();
            if (!ALLOWED_SAVE_EXT.has(ext)) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    ok: false,
                    error: "不允许的扩展名，允许: " + [...ALLOWED_SAVE_EXT].join(", "),
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
    const gameRoot = pathMod.resolve(gameDir);
    const server = http.createServer((req, res) => {
        const method = req.method || "GET";
        const rawUrl = req.url || "/";
        const q = rawUrl.indexOf("?");
        const pathname = decodeURIComponent(q >= 0 ? rawUrl.slice(0, q) : rawUrl);
        const search = q >= 0 ? rawUrl.slice(q + 1) : "";
        const searchParams = new URLSearchParams(search);
        const nohmr = searchParams.get("nohmr") === "1";
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
                handleSparkSave(req, res, gameRoot);
                return;
            }
            res.writeHead(405, { Allow: "POST" });
            res.end();
            return;
        }
        if (pathname === "/spark" || pathname === "/spark/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(splitShellHtml(port));
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
            if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
                res.writeHead(404);
                res.end("Not found");
                return;
            }
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(fs.readFileSync(full, "utf-8"));
            return;
        }
        const staticPath = pathname === "/" ? "/index.html" : pathname;
        const relative = staticPath.replace(/^[/\\]+/, "");
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
    let debounceTimer;
    const watcher = watch(gameRoot, {
        ignoreInitial: true,
        ignored: /(^|[/\\])\./,
    });
    watcher.on("all", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            wss.clients.forEach((client) => {
                if (client.readyState === 1) {
                    client.send("reload");
                }
            });
        }, 200);
    });
    server.listen(port);
    return {
        port,
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
