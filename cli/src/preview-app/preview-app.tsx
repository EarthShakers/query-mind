import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseUnifiedDiff } from "./unified-diff";

type GameEntry = { slug: string; title?: string };
type Hunk = {
  index: number;
  rawHeader: string;
  rawLines: string[];
  oldStart: number;
  oldLines: number;
  newStart?: number;
  newLines?: number;
};
type PendingPatch = {
  id: string;
  path: string;
  hunks: Hunk[];
};

const styles = `
*{box-sizing:border-box}body{margin:0;background:#0d0d0d;color:#e5e7eb;font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.app{height:100vh;display:flex;flex-direction:column}
.head{padding:8px 12px;border-bottom:1px solid #2a2a2a;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.grow{flex:1}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
button,select{border:1px solid #3a3a3a;background:#1f2937;color:#e5e7eb;border-radius:8px;padding:6px 10px;cursor:pointer}
button.primary{background:#2563eb;border-color:#2563eb;color:#fff}
button:disabled{opacity:.5;cursor:not-allowed}
.status{font-size:12px;color:#94a3b8}
.status.err{color:#f87171}
.status.ok{color:#4ade80}
.patch{border-bottom:1px solid #2a2a2a;background:#0f172a;padding:10px;display:flex;flex-direction:column;gap:8px}
.patch[hidden]{display:none}
.hunks{max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:8px}
.hunk{border:1px solid #1e293b;border-radius:8px;overflow:hidden;background:#020617}
.hhead{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #1e293b;background:#0b1220}
.hhead .actions{margin-left:auto;display:flex;gap:6px}
.hbody{margin:0;padding:10px;white-space:pre;overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}
.main{flex:1;display:flex;min-height:0}
.left{width:48%;display:flex;border-right:1px solid #2a2a2a;min-width:260px}
.files{width:220px;border-right:1px solid #2a2a2a;overflow:auto}
.files button{display:block;width:100%;text-align:left;border:0;border-radius:0;background:transparent;padding:6px 10px}
.files button.active{background:#1e3a5f;color:#93c5fd}
.editor{flex:1;display:flex;flex-direction:column}
.editor textarea{flex:1;background:#0b0b0b;color:#e5e7eb;border:0;outline:0;padding:12px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;resize:none}
.monaco-editor .diff-line-addition{background:rgba(46,160,67,.2)!important}
.monaco-editor .diff-line-addition-glyph{background:#2ea043!important}
.monaco-editor .diff-line-deletion{background:rgba(248,81,73,.2)!important}
.monaco-editor .diff-line-deletion-glyph{background:#f85149!important}
.diff-hunk-widget{background:#111827;border:1px solid #374151;border-radius:6px;padding:2px 6px;display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:4px;box-shadow:0 4px 14px rgba(0,0,0,.5);font-family:system-ui,sans-serif;white-space:nowrap}
.diff-hunk-widget .diff-btn{border:0;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;cursor:pointer;color:#fff;white-space:nowrap;flex-shrink:0;line-height:1.3}
.diff-hunk-widget .diff-btn-apply{background:#16a34a}
.diff-hunk-widget .diff-btn-apply:hover{background:#22c55e}
.diff-hunk-widget .diff-btn-reject{background:#dc2626}
.diff-hunk-widget .diff-btn-reject:hover{background:#ef4444}
.patch-actions{display:flex;flex-wrap:nowrap;align-items:center;gap:8px}
.patch-hint{font-size:12px;color:#94a3b8}
.editor #monaco-host{flex:1;min-height:0}
.right{flex:1;display:flex;flex-direction:column}
.right iframe{flex:1;border:0;background:#111}
`;

declare global {
  interface Window {
    monaco?: any;
    require?: any;
    MonacoEnvironment?: any;
  }
}

function useInjectStyles() {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = styles;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);
}

function findHunkStart(lines: string[], startIdx: number, expectedOld: string[]): number {
  const maxDrift = 12;
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

function resolveHunkSpliceStart(lines: string[], hunk: Hunk): number {
  const expectedOld = hunk.rawLines
    .filter((line) => !line.startsWith("+"))
    .map((line) => line.slice(1));
  let startIdx = Math.max(0, hunk.oldStart - 1);
  if (expectedOld.length > 0) {
    const candidate = lines.slice(startIdx, startIdx + expectedOld.length);
    const exact =
      candidate.length === expectedOld.length &&
      candidate.every((line, i) => line === expectedOld[i]);
    if (!exact) {
      const found = findHunkStart(lines, startIdx, expectedOld);
      if (found >= 0) startIdx = found;
    }
  } else {
    startIdx = Math.min(lines.length, startIdx);
  }
  return startIdx;
}

/** 将 unified diff 按行展开进当前文件文本，便于在行内标绿/红（与 preview.ts 内嵌页逻辑一致） */
function computeHybridContent(
  original: string,
  hunks: Hunk[]
): { content: string; types: number[] } {
  const lines = original.replace(/\r\n/g, "\n").split("\n");
  const lineTypes = lines.map(() => 0);
  const sortedHunks = hunks.slice().sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of sortedHunks) {
    const startIdx = resolveHunkSpliceStart(lines, hunk);
    const hybridHunkLines = hunk.rawLines.map((l) => l.slice(1));
    const hybridHunkTypes = hunk.rawLines.map((l) =>
      l.startsWith("+") ? 1 : l.startsWith("-") ? -1 : 0
    );
    lines.splice(startIdx, hunk.oldLines, ...hybridHunkLines);
    lineTypes.splice(startIdx, hunk.oldLines, ...hybridHunkTypes);
  }
  return { content: lines.join("\n"), types: lineTypes };
}

function findHybridHunkAnchorLine(lineTypes: number[], hunk: Hunk): number {
  let hybridStartLine = 1;
  const matchesNeeded = hunk.oldStart;
  let originalLinesFound = 0;
  for (let i = 0; i < lineTypes.length; i++) {
    if (lineTypes[i] === 0 || lineTypes[i] === -1) {
      originalLinesFound++;
    }
    if (originalLinesFound === matchesNeeded) {
      hybridStartLine = i + 1;
      while (hybridStartLine > 1 && lineTypes[hybridStartLine - 2] !== 0) {
        hybridStartLine--;
      }
      break;
    }
  }
  return Math.max(1, hybridStartLine);
}

export function PreviewApp({
  port,
  initialGame,
}: {
  port: number;
  initialGame: string;
}) {
  useInjectStyles();
  const [games, setGames] = useState<GameEntry[]>([]);
  const [game, setGame] = useState(initialGame);
  const [files, setFiles] = useState<string[]>([]);
  const [file, setFile] = useState("index.html");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<{
    path: string;
    content: string;
    note?: string;
    isDiff?: boolean;
  } | null>(null);
  const [pendingPatch, setPendingPatch] = useState<PendingPatch | null>(null);
  const [status, setStatus] = useState<{ text: string; ok?: boolean } | null>(null);
  const [refreshToken, setRefreshToken] = useState(Date.now());
  const monacoHostRef = useRef<HTMLDivElement | null>(null);
  const monacoEditorRef = useRef<any>(null);
  const [monacoReady, setMonacoReady] = useState(false);
  const suppressOnChangeRef = useRef(false);
  const diffDecorationsRef = useRef<string[]>([]);
  const diffWidgetsRef = useRef<any[]>([]);
  const pendingPatchRef = useRef(pendingPatch);
  pendingPatchRef.current = pendingPatch;

  const iframeSrc = useMemo(
    () => `/__spark/game/${encodeURIComponent(game)}/index.html?nohmr=1&t=${refreshToken}`,
    [game, refreshToken]
  );

  const inlinePatch = pendingPatch && pendingPatch.path === file ? pendingPatch : null;

  const diffHunksForView = useMemo((): Hunk[] | null => {
    if (inlinePatch?.hunks?.length) return inlinePatch.hunks;
    if (draft?.isDiff && draft.path === file && draft.content.trim()) {
      const hunks = parseUnifiedDiff(draft.content) as Hunk[];
      return hunks.length ? hunks : null;
    }
    return null;
  }, [inlinePatch, draft?.isDiff, draft?.path, draft?.content, file]);

  const hybrid = useMemo(() => {
    if (!diffHunksForView?.length) return null;
    try {
      return computeHybridContent(content, diffHunksForView);
    } catch {
      return null;
    }
  }, [diffHunksForView, content]);

  const editorText = useMemo(() => {
    if (draft && draft.path === file && !draft.isDiff) return draft.content || "";
    if (hybrid) return hybrid.content;
    if (draft && draft.path === file && draft.isDiff) return draft.content || "";
    return content;
  }, [draft, file, content, hybrid]);

  const editorReadOnly =
    !!(draft && draft.path === file) || !!(inlinePatch && hybrid);

  const fileRef = useRef(file);
  fileRef.current = file;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const editorReadOnlyRef = useRef(editorReadOnly);
  editorReadOnlyRef.current = editorReadOnly;

  const fetchJsonSafe = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, init);
    const text = await r.text();
    try {
      return { ok: r.ok, status: r.status, data: JSON.parse(text) };
    } catch {
      const looksHtml =
        /^\s*</.test(text) ||
        r.headers.get("content-type")?.includes("text/html");
      const err = looksHtml
        ? "预览返回了网页而非接口数据：多为预览服务版本过旧未包含 apply-hunk 路由，请在 cli 目录执行 pnpm run build 并重启 spark preview（或重新运行 spark game）。"
        : text.slice(0, 200).trim() || `HTTP ${r.status}`;
      return { ok: false, status: r.status, data: { error: err } };
    }
  };

  const languageForPath = (name: string) => {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript";
    if (ext === "css") return "css";
    if (ext === "json") return "json";
    if (ext === "md") return "markdown";
    if (ext === "ts" || ext === "tsx") return "typescript";
    if (ext === "jsx") return "javascript";
    if (ext === "html" || ext === "htm") return "html";
    return "plaintext";
  };

  const openFile = async (nextFile: string, targetGame = game) => {
    setFile(nextFile);
    if (draft && draft.path === nextFile && !draft.isDiff) {
      setContent(draft.content);
      setDirty(false);
      return;
    }
    const r = await fetch(
      `/__spark/raw/${nextFile.split("/").map(encodeURIComponent).join("/")}?game=${encodeURIComponent(
        targetGame
      )}`
    );
    if (r.ok) {
      setContent(await r.text());
      setDirty(false);
    } else {
      setContent("<!-- 文件不存在，保存将创建 -->");
      setDirty(true);
    }
  };

  const loadGames = async () => {
    const rsp = await fetchJsonSafe("/__spark/games");
    if (!rsp.ok) return;
    const j = rsp.data || {};
    const list = (j.catalog || j.games || []).map((item: any) =>
      typeof item === "string" ? { slug: item, title: item } : item
    );
    setGames(list);
  };

  const loadFiles = async (targetGame = game) => {
    const rsp = await fetchJsonSafe(`/__spark/list?game=${encodeURIComponent(targetGame)}`);
    if (!rsp.ok) return;
    const j = rsp.data || {};
    const list: string[] = j.files || [];
    setFiles(list);
    if (!list.includes(file)) {
      const first = list[0] || "index.html";
      await openFile(first, targetGame);
    }
  };

  const loadPatch = async () => {
    const rsp = await fetchJsonSafe(`/__spark/patch?game=${encodeURIComponent(game)}`);
    if (!rsp.ok) {
      setPendingPatch(null);
      return;
    }
    const j = rsp.data || {};
    setPendingPatch(j.patch || null);
  };

  const save = async () => {
    const rsp = await fetchJsonSafe("/__spark/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, path: file, content }),
    });
    const j = rsp.data || null;
    if (!rsp.ok || !j?.ok) {
      setStatus({ text: `保存失败: ${j?.error || rsp.status}`, ok: false });
      return;
    }
    setDirty(false);
    setStatus({ text: "已保存", ok: true });
    await loadFiles();
    setRefreshToken(Date.now());
  };

  const applyPatchHunk = useCallback(
    async (hunkIndex: number) => {
      const cur = pendingPatchRef.current;
      if (!cur) return;
      const rsp = await fetchJsonSafe("/__spark/patch/apply-hunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, id: cur.id, hunkIndex }),
      });
      const j = rsp.data || null;
      if (!rsp.ok || !j?.ok) {
        setStatus({ text: `应用片段失败: ${j?.error || rsp.status}`, ok: false });
        return;
      }
      setStatus({ text: "已采纳该片段", ok: true });
      await loadPatch();
      await loadFiles();
      await openFile(file);
      setRefreshToken(Date.now());
    },
    [game, file]
  );

  const rejectPatchHunk = useCallback(
    async (hunkIndex: number) => {
      const cur = pendingPatchRef.current;
      if (!cur) return;
      const rsp = await fetchJsonSafe("/__spark/patch/reject-hunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, id: cur.id, hunkIndex }),
      });
      const j = rsp.data || null;
      if (!rsp.ok || !j?.ok) {
        setStatus({ text: `拒绝片段失败: ${j?.error || rsp.status}`, ok: false });
        return;
      }
      setStatus({ text: "已跳过该片段", ok: true });
      await loadPatch();
      await loadFiles();
      await openFile(file);
      setRefreshToken(Date.now());
    },
    [game, file]
  );

  const patchRejectAll = async () => {
    if (!pendingPatch) return;
    const rsp = await fetchJsonSafe("/__spark/patch/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, id: pendingPatch.id }),
    });
    const j = rsp.data || null;
    if (!rsp.ok || !j?.ok) {
      setStatus({ text: `操作失败: ${j?.error || rsp.status}`, ok: false });
      return;
    }
    setPendingPatch(null);
    await loadFiles();
    await openFile(file);
    setRefreshToken(Date.now());
    setStatus({ text: "已放弃本批变更", ok: true });
  };

  /** 选择全部：一次性写入目标全文（等同逐段全部应用） */
  const patchSelectAll = async () => {
    if (!pendingPatch) return;
    const rsp = await fetchJsonSafe("/__spark/patch/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, id: pendingPatch.id }),
    });
    const j = rsp.data || null;
    if (!rsp.ok || !j?.ok) {
      setStatus({ text: `操作失败: ${j?.error || rsp.status}`, ok: false });
      return;
    }
    setPendingPatch(null);
    await loadFiles();
    await openFile(file);
    setRefreshToken(Date.now());
    setStatus({ text: "已全部采纳", ok: true });
  };

  useEffect(() => {
    void (async () => {
      await loadGames();
      await loadFiles(game);
      await openFile("index.html", game);
      await loadPatch();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void (async () => {
      setFile("index.html");
      setDraft(null);
      await loadFiles(game);
      await openFile("index.html", game);
      await loadPatch();
      setRefreshToken(Date.now());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(() => {
    let canceled = false;
    const loadMonaco = async () => {
      if (window.monaco) {
        setMonacoReady(true);
        return;
      }
      const ensureLoader = () =>
        new Promise<void>((resolve, reject) => {
          if (window.require) {
            resolve();
            return;
          }
          const id = "spark-monaco-loader";
          if (document.getElementById(id)) {
            const timer = setInterval(() => {
              if (window.require) {
                clearInterval(timer);
                resolve();
              }
            }, 50);
            setTimeout(() => {
              clearInterval(timer);
              reject(new Error("monaco loader timeout"));
            }, 8000);
            return;
          }
          const s = document.createElement("script");
          s.id = id;
          s.src = "/__spark/vendor/monaco/vs/loader.js";
          s.onload = () => resolve();
          s.onerror = () => {
            s.remove();
            const fallback = document.createElement("script");
            fallback.id = id;
            fallback.src = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js";
            fallback.onload = () => resolve();
            fallback.onerror = () => reject(new Error("monaco loader failed"));
            document.head.appendChild(fallback);
          };
          document.head.appendChild(s);
        });

      try {
        await ensureLoader();
        if (!window.require) throw new Error("require missing");
        window.MonacoEnvironment = {
          getWorkerUrl: (_moduleId: string, label: string) => {
            const b = "/__spark/vendor/monaco/vs";
            if (label === "json") return `${b}/language/json/json.worker.js`;
            if (label === "css" || label === "scss" || label === "less")
              return `${b}/language/css/css.worker.js`;
            if (label === "html" || label === "handlebars" || label === "razor")
              return `${b}/language/html/html.worker.js`;
            if (label === "typescript" || label === "javascript")
              return `${b}/language/typescript/ts.worker.js`;
            return `${b}/editor/editor.worker.js`;
          },
        };
        window.require.config({
          paths: { vs: "/__spark/vendor/monaco/vs" },
        });
        await new Promise<void>((resolve, reject) => {
          window.require(["vs/editor/editor.main"], () => resolve(), reject);
        });
        if (!canceled) setMonacoReady(true);
      } catch {
        if (!canceled) setMonacoReady(false);
      }
    };
    void loadMonaco();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!monacoReady || !monacoHostRef.current || monacoEditorRef.current || !window.monaco) {
      return;
    }
    window.monaco.editor.defineTheme("spark-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: { "editor.background": "#0b0b0b" },
    });
    window.monaco.editor.setTheme("spark-dark");
    monacoEditorRef.current = window.monaco.editor.create(monacoHostRef.current, {
      value: editorText || "",
      language: languageForPath(file),
      fontSize: 13,
      wordWrap: "on",
      minimap: { enabled: false },
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      glyphMargin: true,
      readOnly: editorReadOnlyRef.current,
    });
    monacoEditorRef.current.onDidChangeModelContent(() => {
      if (suppressOnChangeRef.current) return;
      if (editorReadOnlyRef.current) return;
      if (draftRef.current && draftRef.current.path === fileRef.current) return;
      const v = monacoEditorRef.current.getValue();
      setContent(v);
      setDirty(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在 Monaco 就绪时创建一次
  }, [monacoReady]);

  useEffect(() => {
    const editor = monacoEditorRef.current;
    if (!editor) return;
    editor.updateOptions({ readOnly: editorReadOnly });
  }, [editorReadOnly]);

  useEffect(() => {
    const editor = monacoEditorRef.current;
    if (!editor || !window.monaco) return;
    suppressOnChangeRef.current = true;
    try {
      if (editor.getValue() !== editorText) editor.setValue(editorText || "");
      const model = editor.getModel();
      if (model) window.monaco.editor.setModelLanguage(model, languageForPath(file));
    } finally {
      suppressOnChangeRef.current = false;
    }
  }, [editorText, file]);

  useEffect(() => {
    return () => {
      if (monacoEditorRef.current) {
        monacoEditorRef.current.dispose();
        monacoEditorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const editor = monacoEditorRef.current;
    const monaco = window.monaco;
    const clearDiffUi = () => {
      if (editor && diffDecorationsRef.current.length) {
        diffDecorationsRef.current = editor.deltaDecorations(diffDecorationsRef.current, []);
        diffDecorationsRef.current = [];
      }
      if (editor) {
        for (const w of diffWidgetsRef.current) {
          editor.removeContentWidget(w);
        }
      }
      diffWidgetsRef.current = [];
    };

    if (!editor || !monaco || !hybrid) {
      clearDiffUi();
      return;
    }

    const { types } = hybrid;
    const decos: Array<{ range: unknown; options: Record<string, unknown> }> = [];
    types.forEach((type, idx) => {
      const lineNum = idx + 1;
      if (type === 1) {
        decos.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: {
            isWholeLine: true,
            className: "diff-line-addition",
            glyphMarginClassName: "diff-line-addition-glyph",
            overviewRuler: { color: "#2ea043", position: 7 },
          },
        });
      } else if (type === -1) {
        decos.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: {
            isWholeLine: true,
            className: "diff-line-deletion",
            glyphMarginClassName: "diff-line-deletion-glyph",
            overviewRuler: { color: "#f85149", position: 7 },
          },
        });
      }
    });
    diffDecorationsRef.current = editor.deltaDecorations(diffDecorationsRef.current, decos);

    if (inlinePatch) {
      const sorted = [...inlinePatch.hunks].sort((a, b) => a.oldStart - b.oldStart);
      for (const hunk of sorted) {
        const lineNumber = findHybridHunkAnchorLine(types, hunk);
        const hunkIdx = hunk.index;
        const dom = document.createElement("div");
        dom.className = "diff-hunk-widget";
        const applyBtn = document.createElement("button");
        applyBtn.type = "button";
        applyBtn.className = "diff-btn diff-btn-apply";
        applyBtn.textContent = "应用";
        applyBtn.onclick = () => void applyPatchHunk(hunkIdx);
        const rejectBtn = document.createElement("button");
        rejectBtn.type = "button";
        rejectBtn.className = "diff-btn diff-btn-reject";
        rejectBtn.textContent = "拒绝";
        rejectBtn.onclick = () => void rejectPatchHunk(hunkIdx);
        dom.appendChild(applyBtn);
        dom.appendChild(rejectBtn);
        const widget = {
          getId: () => `spark-hunk-${inlinePatch.id}-${hunk.index}`,
          getDomNode: () => dom,
          getPosition: () => ({
            position: { lineNumber, column: 1 },
            preference: [2, 1],
          }),
        };
        editor.addContentWidget(widget);
        diffWidgetsRef.current.push(widget);
      }
    }

    return () => {
      clearDiffUi();
    };
  }, [hybrid, inlinePatch, applyPatchHunk, rejectPatchHunk, file, monacoReady, draft?.isDiff, draft?.content]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.hostname}:${port}`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === "draft") {
          if (data.payload?.path) {
            setDraft(data.payload);
            if (data.payload.path === file || file === "index.html") {
              if (data.payload.isDiff) {
                void openFile(data.payload.path);
              } else {
                setFile(data.payload.path);
                setContent(data.payload.content || "");
              }
              setDirty(false);
            }
          } else {
            setDraft(null);
            void openFile(file);
            setRefreshToken(Date.now());
          }
          return;
        }
        if (data?.type === "patch") {
          void loadPatch();
          return;
        }
      } catch {
        // ignore
      }
      void loadFiles();
      void openFile(file);
      setRefreshToken(Date.now());
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, game, file]);

  return (
    <div className="app">
      <header className="head">
        <strong>spark</strong>
        <select value={game} onChange={(e) => setGame(e.target.value)}>
          {(games.length ? games : [{ slug: game, title: game }]).map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.title || g.slug}
            </option>
          ))}
        </select>
        <span className="mono">{file}</span>
        <span className="grow" />
        <button onClick={() => void loadFiles()}>刷新列表</button>
        <button
          className="primary"
          disabled={!!draft || editorReadOnly}
          onClick={() => void save()}
        >
          保存
        </button>
        <span className={`status ${status?.ok === false ? "err" : status?.ok ? "ok" : ""}`}>
          {draft?.note || status?.text || ""}
        </span>
      </header>

      <section className="patch" hidden={!pendingPatch}>
        <div className="head patch-actions" style={{ padding: 0, borderBottom: "none" }}>
          <strong>待审变更</strong>
          <span className="mono">{pendingPatch?.path}</span>
          <span className="grow" />
          <button onClick={() => void patchRejectAll()}>拒绝全部</button>
          <button className="primary" onClick={() => void patchSelectAll()}>
            选择全部
          </button>
        </div>
        {pendingPatch && pendingPatch.path !== file ? (
          <p className="patch-hint" style={{ margin: "8px 0 0" }}>
            当前打开的是 <span className="mono">{file}</span>。请打开{" "}
            <span className="mono">{pendingPatch.path}</span>
            ，在变更行旁使用「应用」写入该段或「拒绝」跳过。
          </p>
        ) : (
          <p className="patch-hint" style={{ margin: "8px 0 0" }}>
            绿/红为增删；每段旁「应用」立即写入磁盘，「拒绝」从本批目标中去掉该段。「选择全部」一次采纳剩余所有变更。
          </p>
        )}
      </section>

      <main className="main">
        <section className="left">
          <aside className="files">
            {files.map((p) => (
              <button
                key={p}
                className={p === file ? "active" : ""}
                onClick={() => void openFile(p)}
              >
                {p}
              </button>
            ))}
          </aside>
          <div className="editor">
            {monacoReady ? (
              <div id="monaco-host" ref={monacoHostRef} />
            ) : (
              <textarea
                value={editorText}
                readOnly={editorReadOnly}
                onChange={(e) => {
                  if (draft && draft.path === file) return;
                  if (editorReadOnly) return;
                  setContent(e.target.value);
                  setDirty(true);
                }}
                spellCheck={false}
              />
            )}
          </div>
        </section>
        <section className="right">
          <iframe title="game" src={iframeSrc} />
        </section>
      </main>
    </div>
  );
}
