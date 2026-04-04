"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  applyOneHunkToText,
  parseUnifiedDiff,
  type UnifiedDiffHunk,
} from "@/lib/spark/unified-diff";

type StudioPayload = {
  id: string;
  slug: string;
  title: string;
  updated_at: string;
  files: Record<string, string>;
  entries: string[];
};

type PendingPatch = {
  path: string;
  diff: string;
  hunks: UnifiedDiffHunk[];
};
type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min";

declare global {
  interface Window {
    monaco?: any;
    require?: any;
    MonacoEnvironment?: any;
  }
}

function isHtmlFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".html") || lower.endsWith(".htm");
}

function looksLikeStarterDraft(content: string | undefined): boolean {
  const text = (content || "").toLowerCase();
  return (
    text.includes("你的游戏草稿已创建") ||
    text.includes("new spark game") ||
    text.includes("start building your game here")
  );
}

function pickPreferredHtmlFile(
  entries: string[],
  files: Record<string, string>
): string {
  const htmlEntries = entries.filter(isHtmlFile);
  if (htmlEntries.length === 0) return "index.html";
  if (!htmlEntries.includes("index.html")) return htmlEntries[0];
  if (!looksLikeStarterDraft(files["index.html"])) return "index.html";
  const better = htmlEntries.find((path) => path !== "index.html");
  return better || "index.html";
}

function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "css") return "css";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript";
  if (ext === "json") return "json";
  if (ext === "md") return "markdown";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "jsx") return "javascript";
  return "plaintext";
}

function isExternalUrl(url: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(url) || /^(?:data:|blob:|#|javascript:|mailto:|tel:)/i.test(url);
}

function normalizeRelPath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\/+/, "");
}

function dirname(path: string): string {
  const p = normalizeRelPath(path);
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(0, idx) : "";
}

function resolveRelPath(baseFile: string, target: string): string {
  const t = normalizeRelPath(target.split("?")[0]?.split("#")[0] || "");
  if (!t) return "";
  const baseDir = dirname(baseFile);
  const segs = [...(baseDir ? baseDir.split("/") : []), ...t.split("/")];
  const out: string[] = [];
  for (const seg of segs) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join("/");
}

function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (ext === "html" || ext === "htm") return "text/html;charset=utf-8";
  if (ext === "css") return "text/css;charset=utf-8";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "application/javascript;charset=utf-8";
  if (ext === "json") return "application/json;charset=utf-8";
  if (ext === "svg") return "image/svg+xml;charset=utf-8";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  return "text/plain;charset=utf-8";
}

function buildLocalPreviewDoc(
  entryFile: string,
  files: Record<string, string>
): { html: string; blobUrls: string[] } | null {
  const htmlSource = files[entryFile];
  if (typeof htmlSource !== "string") return null;
  if (!isHtmlFile(entryFile)) return null;
  if (typeof window === "undefined") return null;

  const parser = new window.DOMParser();
  const doc = parser.parseFromString(htmlSource, "text/html");
  const blobUrls: string[] = [];
  const blobByPath = new Map<string, string>();
  const toBlobUrl = (resolvedPath: string): string | null => {
    if (!Object.prototype.hasOwnProperty.call(files, resolvedPath)) return null;
    const existing = blobByPath.get(resolvedPath);
    if (existing) return existing;
    const content = files[resolvedPath] ?? "";
    const blob = new Blob([content], { type: mimeForPath(resolvedPath) });
    const url = URL.createObjectURL(blob);
    blobByPath.set(resolvedPath, url);
    blobUrls.push(url);
    return url;
  };

  const rewriteAttr = (selector: string, attr: "src" | "href") => {
    const nodes = doc.querySelectorAll(selector);
    nodes.forEach((node) => {
      const raw = node.getAttribute(attr);
      if (!raw) return;
      const value = raw.trim();
      if (!value || isExternalUrl(value)) return;
      const resolved = resolveRelPath(entryFile, value);
      const blobUrl = toBlobUrl(resolved);
      if (blobUrl) node.setAttribute(attr, blobUrl);
    });
  };

  rewriteAttr("link[href]", "href");
  rewriteAttr("script[src]", "src");
  rewriteAttr("img[src]", "src");
  rewriteAttr("audio[src]", "src");
  rewriteAttr("video[src]", "src");
  rewriteAttr("source[src]", "src");

  const html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  return { html, blobUrls };
}

function estimateLineCount(content: string): number {
  if (!content) return 0;
  return content.replace(/\r\n/g, "\n").split("\n").length;
}

function describeDraftPhase(content: string): string | null {
  const lower = content.toLowerCase();
  if (lower.includes("level") || lower.includes("关卡")) return "关卡逻辑";
  if (lower.includes("settings") || lower.includes("panel") || lower.includes("参数"))
    return "参数面板";
  if (lower.includes("particle") || lower.includes("粒子")) return "特效";
  if (
    lower.includes("<style") ||
    lower.includes(":root") ||
    lower.includes("background")
  ) {
    return "界面样式";
  }
  if (lower.includes("canvas") || lower.includes("render") || lower.includes("draw")) {
    return "渲染循环";
  }
  return null;
}

function normalizeFilesForCompare(files: Record<string, string>): string {
  const keys = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const obj: Record<string, string> = {};
  for (const key of keys) {
    obj[key] = files[key] ?? "";
  }
  return JSON.stringify(obj);
}

function normalizePublishPath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

type LocalDraftCache = {
  baseHash: string;
  files: Record<string, string>;
};

function writeLocalDraftCache(
  key: string,
  baseHash: string,
  files: Record<string, string>
) {
  try {
    const payload: LocalDraftCache = { baseHash, files };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore local storage errors
  }
}

function errorToText(input: unknown, fallback = "请求失败"): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const obj = input as {
      message?: unknown;
      formErrors?: unknown;
      fieldErrors?: unknown;
    };
    if (typeof obj.message === "string") return obj.message;
    if (Array.isArray(obj.formErrors) && obj.formErrors.length > 0) {
      const first = obj.formErrors.find((v) => typeof v === "string");
      if (typeof first === "string") return first;
    }
    if (obj.fieldErrors && typeof obj.fieldErrors === "object") {
      for (const value of Object.values(
        obj.fieldErrors as Record<string, unknown>
      )) {
        if (Array.isArray(value) && value.length > 0) {
          const first = value.find((v) => typeof v === "string");
          if (typeof first === "string") return first;
        }
      }
    }
  }
  return fallback;
}

function resolveToastTone(message: string): "success" | "warning" | "error" | "info" {
  if (/失败|错误|无权|不能|请先|不存在|禁止|非法|超时|中断/.test(message)) return "error";
  if (/审核中|无需重复|重复|建议/.test(message)) return "warning";
  if (/已|成功|完成|写入|保存|发布|应用|生成/.test(message)) return "success";
  return "info";
}

function shouldToastForStatus(message: string): boolean {
  if (!message) return false;
  if (/^AI 正在/.test(message)) return false;
  if (/^检测到重生成指令/.test(message)) return false;
  if (/^正在中断生成/.test(message)) return false;
  return true;
}

function findHunkStart(
  lines: string[],
  startIdx: number,
  expectedOld: string[]
): number {
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

function resolveHunkSpliceStart(
  lines: string[],
  hunk: UnifiedDiffHunk
): number {
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

function computeHybridContent(
  original: string,
  hunks: UnifiedDiffHunk[]
): { content: string; types: number[] } {
  const lines = original.replace(/\r\n/g, "\n").split("\n");
  const lineTypes = lines.map(() => 0);
  const sorted = hunks.slice().sort((a, b) => b.oldStart - a.oldStart);
  for (const hunk of sorted) {
    const startIdx = resolveHunkSpliceStart(lines, hunk);
    const hybridLines = hunk.rawLines.map((l) => l.slice(1));
    const hybridTypes = hunk.rawLines.map((l) =>
      l.startsWith("+") ? 1 : l.startsWith("-") ? -1 : 0
    );
    lines.splice(startIdx, hunk.oldLines, ...hybridLines);
    lineTypes.splice(startIdx, hunk.oldLines, ...hybridTypes);
  }
  return { content: lines.join("\n"), types: lineTypes };
}

function findHybridHunkAnchorLine(
  lineTypes: number[],
  hunk: UnifiedDiffHunk
): number {
  let hybridStartLine = 1;
  const matchesNeeded = hunk.oldStart;
  let originalLinesFound = 0;
  for (let i = 0; i < lineTypes.length; i += 1) {
    if (lineTypes[i] === 0 || lineTypes[i] === -1) originalLinesFound += 1;
    if (originalLinesFound === matchesNeeded) {
      hybridStartLine = i + 1;
      while (hybridStartLine > 1 && lineTypes[hybridStartLine - 2] !== 0) {
        hybridStartLine -= 1;
      }
      break;
    }
  }
  return Math.max(1, hybridStartLine);
}

export function GameStudio({
  gameId,
  initialData,
}: {
  gameId: string;
  initialData: StudioPayload;
}) {
  const [data, setData] = useState(initialData);
  const initialPreferredHtml = pickPreferredHtmlFile(
    initialData.entries,
    initialData.files
  );
  const [currentFile, setCurrentFile] = useState(
    initialData.entries.includes(initialPreferredHtml)
      ? initialPreferredHtml
      : initialData.entries[0] || "index.html"
  );
  const [previewFile, setPreviewFile] = useState(
    initialPreferredHtml || "index.html"
  );
  const [draft, setDraft] = useState(
    initialData.files[
      (initialData.entries.includes(initialPreferredHtml)
        ? initialPreferredHtml
        : initialData.entries[0]) || "index.html"
    ] || ""
  );
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [previewToken, setPreviewToken] = useState(0);
  const [pendingPatch, setPendingPatch] = useState<PendingPatch | null>(null);
  const [patchStreamDraft, setPatchStreamDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [localSavedFiles, setLocalSavedFiles] = useState<Record<string, string>>(
    initialData.files || {}
  );
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [publishVersion, setPublishVersion] = useState("v1.0.0");
  const [publishNote, setPublishNote] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isAssisting, setIsAssisting] = useState(false);
  const [monacoReady, setMonacoReady] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [toastState, setToastState] = useState<{ id: number; message: string } | null>(null);
  const [publishedBaseline, setPublishedBaseline] = useState(() =>
    normalizeFilesForCompare(initialData.files || {})
  );
  const [showFilesPane, setShowFilesPane] = useState(true);
  const [paneWidths, setPaneWidths] = useState<{ code: number; preview: number }>({
    code: 420,
    preview: 560,
  });
  const initialCloudHash = useMemo(
    () => normalizeFilesForCompare(initialData.files || {}),
    [initialData.files]
  );

  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);
  const suppressOnChangeRef = useRef(false);
  const diffDecorationsRef = useRef<string[]>([]);
  const diffWidgetsRef = useRef<any[]>([]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const abortByUserRef = useRef(false);
  const initialFilesRef = useRef<Record<string, string>>(initialData.files || {});
  const saveActionRef = useRef<() => void>(() => {});
  const localStorageKeyRef = useRef(`spark:studio:${gameId}:local-files`);
  const splitStorageKeyRef = useRef(`spark:studio:${gameId}:split-layout-v3`);
  const previewBlobUrlsRef = useRef<string[]>([]);
  const splitRootRef = useRef<HTMLDivElement | null>(null);
  const hasStoredSplitRef = useRef(false);
  const dragStateRef = useRef<{
    mode: "code-preview" | "preview-chat";
    startX: number;
    startCode: number;
    startPreview: number;
    pointerId: number;
  } | null>(null);

  const FILES_PANE_WIDTH = 140;
  const SPLITTER_WIDTH = 10;
  const MIN_CODE_WIDTH = 260;
  const MIN_PREVIEW_WIDTH = 300;
  const MIN_CHAT_WIDTH = 260;

  const clampLayout = (
    width: { code: number; preview: number },
    totalWidth: number
  ) => {
    const fixed = (showFilesPane ? FILES_PANE_WIDTH : 0) + SPLITTER_WIDTH * 2;
    const maxSum = Math.max(
      MIN_CODE_WIDTH + MIN_PREVIEW_WIDTH,
      totalWidth - fixed - MIN_CHAT_WIDTH
    );
    let code = Math.max(MIN_CODE_WIDTH, Math.round(width.code));
    let preview = Math.max(MIN_PREVIEW_WIDTH, Math.round(width.preview));
    if (code + preview > maxSum) {
      const overflow = code + preview - maxSum;
      const cutPreview = Math.min(overflow, preview - MIN_PREVIEW_WIDTH);
      preview -= cutPreview;
      code -= overflow - cutPreview;
    }
    code = Math.max(MIN_CODE_WIDTH, code);
    preview = Math.max(MIN_PREVIEW_WIDTH, preview);
    return { code, preview };
  };

  const computeDefaultPaneWidths = (totalWidth: number) => {
    const fixed = (showFilesPane ? FILES_PANE_WIDTH : 0) + SPLITTER_WIDTH * 2;
    const flex = Math.max(0, totalWidth - fixed);
    // code:preview:chat = 4:5:3
    return clampLayout(
      {
        code: (flex * 4) / 12,
        preview: (flex * 5) / 12,
      },
      totalWidth
    );
  };

  const iframeSrc = useMemo(
    () =>
      `/api/spark/private/${gameId}/${encodeURIComponent(
        previewFile
      )}?t=${previewToken}`,
    [gameId, previewFile, previewToken]
  );

  const hybrid = useMemo(() => {
    if (!pendingPatch?.hunks?.length) return null;
    try {
      return computeHybridContent(draft, pendingPatch.hunks);
    } catch {
      return null;
    }
  }, [draft, pendingPatch]);

  const editorValue = hybrid ? hybrid.content : draft;
  const savedCurrent = localSavedFiles[currentFile] ?? data.files[currentFile] ?? "";
  const hasUnsavedLocal = draft !== savedCurrent;
  const effectiveLocalFiles = useMemo(
    () => ({
      ...data.files,
      ...localSavedFiles,
      [currentFile]: draft,
    }),
    [currentFile, data.files, draft, localSavedFiles]
  );
  const hasUnpublishedChanges =
    normalizeFilesForCompare(effectiveLocalFiles) !== publishedBaseline;
  const shouldWarnOnLeave = hasUnsavedLocal || hasUnpublishedChanges;

  const addMessage = (role: ChatMessage["role"], content: string): string => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [...prev, { id, role, content }]);
    return id;
  };

  const updateMessage = (id: string, content: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content } : m))
    );
  };

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = promptInputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.max(36, Math.min(el.scrollHeight, 132));
    el.style.height = `${next}px`;
  }, [prompt]);

  useEffect(() => {
    if (!status || !shouldToastForStatus(status)) return;
    setToastState({
      id: Date.now() + Math.floor(Math.random() * 1000),
      message: status,
    });
  }, [status]);

  useEffect(() => {
    if (!toastState) return;
    const timer = window.setTimeout(() => setToastState(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toastState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(splitStorageKeyRef.current);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { code?: number; preview?: number } | null;
      if (!parsed) return;
      const root = splitRootRef.current;
      const total = root?.getBoundingClientRect().width || window.innerWidth;
      hasStoredSplitRef.current = true;
      setPaneWidths(
        clampLayout(
          {
            code: Number(parsed.code) || 560,
            preview: Number(parsed.preview) || 520,
          },
          total
        )
      );
    } catch {
      // ignore invalid split cache
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = splitRootRef.current;
    if (!root) return;
    const total = root.getBoundingClientRect().width;
    if (hasStoredSplitRef.current) {
      setPaneWidths((prev) => clampLayout(prev, total));
      return;
    }
    setPaneWidths(computeDefaultPaneWidths(total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFilesPane]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const root = splitRootRef.current;
      if (!root) return;
      const total = root.getBoundingClientRect().width;
      setPaneWidths((prev) => clampLayout(prev, total));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      const root = splitRootRef.current;
      if (!drag || !root) return;
      if (event.pointerId !== drag.pointerId) return;
      const total = root.getBoundingClientRect().width;
      const delta = event.clientX - drag.startX;
      event.preventDefault();
      if (drag.mode === "code-preview") {
        const next = clampLayout(
          {
            code: drag.startCode + delta,
            preview: drag.startPreview - delta,
          },
          total
        );
        setPaneWidths(next);
        return;
      }
      const fixed = (showFilesPane ? FILES_PANE_WIDTH : 0) + SPLITTER_WIDTH * 2;
      const maxPreview = Math.max(
        MIN_PREVIEW_WIDTH,
        total - fixed - drag.startCode - MIN_CHAT_WIDTH
      );
      const nextPreview = Math.max(
        MIN_PREVIEW_WIDTH,
        Math.min(maxPreview, drag.startPreview + delta)
      );
      setPaneWidths(
        clampLayout(
          {
            code: drag.startCode,
            preview: nextPreview,
          },
          total
        )
      );
    };
    const finishDrag = () => {
      const drag = dragStateRef.current;
      if (!drag) return;
      dragStateRef.current = null;
      document.body.style.cursor = "";
      try {
        localStorage.setItem(
          splitStorageKeyRef.current,
          JSON.stringify(paneWidths)
        );
      } catch {
        // ignore local storage errors
      }
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneWidths, showFilesPane]);

  const startSplitDrag = (
    mode: "code-preview" | "preview-chat",
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const root = splitRootRef.current;
    if (!root) return;
    dragStateRef.current = {
      mode,
      startX: event.clientX,
      startCode: paneWidths.code,
      startPreview: paneWidths.preview,
      pointerId: event.pointerId,
    };
    document.body.style.cursor = "col-resize";
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore capture failures
    }
  };

  const resetSplitLayout = () => {
    const root = splitRootRef.current;
    const total = root?.getBoundingClientRect().width || 1600;
    const next = computeDefaultPaneWidths(total);
    setPaneWidths(next);
    try {
      localStorage.setItem(splitStorageKeyRef.current, JSON.stringify(next));
    } catch {
      // ignore local storage errors
    }
  };

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldWarnOnLeave) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldWarnOnLeave]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!shouldWarnOnLeave) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash === window.location.hash
      ) {
        return;
      }
      const ok = window.confirm("你有未发布的代码变更，确认离开创作台吗？");
      if (!ok) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [shouldWarnOnLeave]);

  useEffect(() => {
    setDraft(localSavedFiles[currentFile] ?? data.files[currentFile] ?? "");
    setPendingPatch(null);
    setPatchStreamDraft("");
  }, [currentFile, data.files, localSavedFiles]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(localStorageKeyRef.current);
      if (!raw) return;
      const parsed = JSON.parse(raw) as
        | LocalDraftCache
        | Record<string, string>
        | null;
      if (!parsed || typeof parsed !== "object") return;
      if ("baseHash" in parsed && "files" in parsed) {
        const cache = parsed as LocalDraftCache;
        if (
          cache.baseHash === initialCloudHash &&
          cache.files &&
          typeof cache.files === "object"
        ) {
          setLocalSavedFiles((prev) => ({ ...prev, ...cache.files }));
        } else {
          localStorage.removeItem(localStorageKeyRef.current);
        }
        return;
      }
      // 旧版缓存格式没有基线信息，容易造成“试玩/创作台版本不一致”，启动时清理
      localStorage.removeItem(localStorageKeyRef.current);
    } catch {
      // ignore invalid local cache
    }
  }, [initialCloudHash]);

  useEffect(() => {
    if (isHtmlFile(currentFile)) setPreviewFile(currentFile);
  }, [currentFile]);

  useEffect(() => {
    for (const url of previewBlobUrlsRef.current) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    previewBlobUrlsRef.current = [];
    const localFiles = {
      ...data.files,
      ...localSavedFiles,
      [currentFile]: draft,
    };
    const built = buildLocalPreviewDoc(previewFile, localFiles);
    if (built) {
      previewBlobUrlsRef.current = built.blobUrls;
      setPreviewDoc(built.html);
      return;
    }
    setPreviewDoc(null);
  }, [currentFile, data.files, draft, localSavedFiles, previewFile, previewToken]);

  useEffect(() => {
    return () => {
      for (const url of previewBlobUrlsRef.current) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      previewBlobUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    const ensureLoader = () =>
      new Promise<void>((resolve, reject) => {
        if (window.monaco && window.require) {
          resolve();
          return;
        }
        const id = "studio-monaco-loader";
        if (document.getElementById(id)) {
          const timer = setInterval(() => {
            if (window.require && window.monaco) {
              clearInterval(timer);
              resolve();
            }
          }, 50);
          setTimeout(() => {
            clearInterval(timer);
            reject(new Error("monaco loader timeout"));
          }, 10000);
          return;
        }
        const script = document.createElement("script");
        script.id = id;
        script.src = `${MONACO_CDN}/vs/loader.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("monaco loader failed"));
        document.head.appendChild(script);
      });

    const load = async () => {
      try {
        await ensureLoader();
        if (!window.require) throw new Error("monaco require missing");
        const base = `${MONACO_CDN}/vs`;
        window.MonacoEnvironment = {
          getWorkerUrl: (_moduleId: string, label: string) => {
            if (label === "json") return `${base}/language/json/json.worker.js`;
            if (label === "css" || label === "scss" || label === "less")
              return `${base}/language/css/css.worker.js`;
            if (label === "html" || label === "handlebars" || label === "razor")
              return `${base}/language/html/html.worker.js`;
            if (label === "typescript" || label === "javascript")
              return `${base}/language/typescript/ts.worker.js`;
            return `${base}/editor/editor.worker.js`;
          },
        };
        window.require.config({ paths: { vs: base } });
        await new Promise<void>((resolve, reject) => {
          window.require(["vs/editor/editor.main"], () => resolve(), reject);
        });
        if (!canceled && window.monaco) {
          monacoRef.current = window.monaco;
          setMonacoReady(true);
        }
      } catch {
        if (!canceled) setMonacoReady(false);
      }
    };
    void load();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !monacoReady ||
      !editorHostRef.current ||
      editorRef.current ||
      !monacoRef.current
    ) {
      return;
    }
    const monaco = monacoRef.current;
    monaco.editor.defineTheme("spark-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: { "editor.background": "#05070d" },
    });
    monaco.editor.setTheme("spark-dark");
    const editor = monaco.editor.create(editorHostRef.current, {
      value: editorValue,
      language: languageForPath(currentFile),
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 22,
      wordWrap: "on",
      tabSize: 2,
      insertSpaces: true,
      glyphMargin: true,
      scrollBeyondLastLine: false,
      theme: "spark-dark",
    });
    editor.onDidChangeModelContent(() => {
      if (suppressOnChangeRef.current) return;
      if (pendingPatch) return;
      setDraft(editor.getValue());
    });
    editorRef.current = editor;
    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monacoReady]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    suppressOnChangeRef.current = true;
    try {
      const model = editor.getModel();
      if (model)
        monaco.editor.setModelLanguage(model, languageForPath(currentFile));
      if (editor.getValue() !== editorValue) editor.setValue(editorValue);
      editor.updateOptions({ readOnly: Boolean(pendingPatch) });
    } finally {
      suppressOnChangeRef.current = false;
    }
  }, [currentFile, editorValue, pendingPatch]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (diffDecorationsRef.current.length) {
      diffDecorationsRef.current = editor.deltaDecorations(
        diffDecorationsRef.current,
        []
      );
    }
    for (const w of diffWidgetsRef.current) editor.removeContentWidget(w);
    diffWidgetsRef.current = [];

    if (!hybrid || !pendingPatch) return;

    const decos: any[] = [];
    hybrid.types.forEach((type, idx) => {
      const lineNum = idx + 1;
      if (type === 1) {
        decos.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: {
            isWholeLine: true,
            className: "diff-line-addition",
            glyphMarginClassName: "diff-line-addition-glyph",
          },
        });
      } else if (type === -1) {
        decos.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: {
            isWholeLine: true,
            className: "diff-line-deletion",
            glyphMarginClassName: "diff-line-deletion-glyph",
          },
        });
      }
    });
    diffDecorationsRef.current = editor.deltaDecorations([], decos);

    for (const hunk of pendingPatch.hunks) {
      const lineNumber = findHybridHunkAnchorLine(hybrid.types, hunk);
      const dom = document.createElement("div");
      dom.className = "diff-hunk-widget";

      const rejectBtn = document.createElement("button");
      rejectBtn.type = "button";
      rejectBtn.className = "diff-btn diff-btn-reject";
      rejectBtn.textContent = "Reject";
      rejectBtn.onclick = () => rejectHunk(hunk.index);

      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = "diff-btn diff-btn-apply";
      applyBtn.textContent = "Apply";
      applyBtn.onclick = () => applyHunk(hunk.index);

      dom.appendChild(rejectBtn);
      dom.appendChild(applyBtn);

      const widget = {
        getId: () => `studio-hunk-${hunk.index}`,
        getDomNode: () => dom,
        getPosition: () => ({
          position: { lineNumber, column: 1 },
          preference: [2, 1],
        }),
      };
      editor.addContentWidget(widget);
      diffWidgetsRef.current.push(widget);
    }

    return () => {
      if (!editorRef.current) return;
      for (const w of diffWidgetsRef.current)
        editorRef.current.removeContentWidget(w);
      diffWidgetsRef.current = [];
    };
  }, [hybrid, pendingPatch]);

  async function refresh() {
    const res = await fetch(`/api/spark/editor/${gameId}`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      setStatus(errorToText(json?.error, "刷新失败"));
      return;
    }
    setData(json as StudioPayload);
    const nextFiles = (json.files || {}) as Record<string, string>;
    initialFilesRef.current = { ...nextFiles };
    setPublishedBaseline(normalizeFilesForCompare(nextFiles));
    const nextEntries = json.entries as string[];
    const preferredHtml = pickPreferredHtmlFile(nextEntries, nextFiles);
    if (!nextEntries.includes(currentFile)) {
      setCurrentFile(
        nextEntries.includes(preferredHtml)
          ? preferredHtml
          : nextEntries[0] || "index.html"
      );
    }
    if (
      !nextEntries.includes(previewFile) ||
      (previewFile === "index.html" &&
        looksLikeStarterDraft(nextFiles["index.html"]))
    ) {
      setPreviewFile(preferredHtml);
    }
  }

  function saveCurrent() {
    if (pendingPatch) {
      setStatus("请先处理完当前补丁，再保存");
      return;
    }
    startSaving(async () => {
      setLocalSavedFiles((prev) => {
        const next = { ...prev, [currentFile]: draft };
        writeLocalDraftCache(
          localStorageKeyRef.current,
          publishedBaseline,
          next
        );
        return next;
      });
      setPreviewToken((t) => t + 1);
      setStatus(`已本地保存 ${currentFile}`);
    });
  }

  saveActionRef.current = saveCurrent;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSave =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "s";
      if (!isSave) return;
      event.preventDefault();
      saveActionRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function undoEdit() {
    const editor = editorRef.current;
    if (!editor || pendingPatch) return;
    editor.trigger("studio", "undo", null);
  }

  function redoEdit() {
    const editor = editorRef.current;
    if (!editor || pendingPatch) return;
    editor.trigger("studio", "redo", null);
  }

  function restoreInitialVersion() {
    if (pendingPatch) {
      setStatus("请先处理完当前补丁，再还原");
      return;
    }
    const initial = initialFilesRef.current[currentFile];
    if (typeof initial !== "string") {
      setStatus("该文件没有可还原的初始版本");
      return;
    }
    setDraft(initial);
    setStatus(`已还原 ${currentFile} 到初始版本（未保存）`);
    addMessage("system", `已还原 ${currentFile} 到初始版本，记得点保存。`);
  }

  async function publishToReview() {
    if (pendingPatch) {
      setStatus("请先处理完当前补丁，再发布");
      return;
    }
    const savedCurrent = localSavedFiles[currentFile] ?? data.files[currentFile] ?? "";
    if (draft !== savedCurrent) {
      setStatus("当前文件有未保存本地修改，请先点保存");
      return;
    }
    const mergedFiles: Record<string, string> = {
      ...data.files,
      ...localSavedFiles,
      [currentFile]: draft,
    };
    const files: Record<string, string> = {};
    for (const [rawKey, value] of Object.entries(mergedFiles)) {
      if (typeof value !== "string") continue;
      const key = normalizePublishPath(rawKey);
      if (!key) continue;
      files[key] = value;
    }
    if (!Object.prototype.hasOwnProperty.call(files, "index.html")) {
      files["index.html"] = data.files["index.html"] || "";
    }
    if (!(files["index.html"] || "").trim()) {
      setStatus("请先完成 index.html 再发布");
      return;
    }

    setIsPublishing(true);
    try {
      const res = await fetch(`/api/spark/editor/${gameId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: publishVersion.trim() || "v1.0.0",
          note: publishNote.trim() || undefined,
          files,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409) {
          setIsPublishOpen(false);
        }
        setStatus(errorToText(json?.error, "发布失败"));
        return;
      }
      setData((prev) => ({
        ...prev,
        files,
        entries: Object.keys(files).sort((a, b) => a.localeCompare(b)),
        updated_at:
          typeof json?.updated_at === "string" ? json.updated_at : prev.updated_at,
      }));
      setLocalSavedFiles(files);
      initialFilesRef.current = { ...files };
      const nextBaseline = normalizeFilesForCompare(files);
      setPublishedBaseline(nextBaseline);
      writeLocalDraftCache(localStorageKeyRef.current, nextBaseline, files);
      setIsPublishOpen(false);
      setPublishNote("");
      setStatus("已提交管理员审核，代码已同步到云端");
      addMessage(
        "system",
        `已发布 ${publishVersion.trim() || "v1.0.0"}，等待管理员审核。`
      );
    } catch {
      setStatus("发布失败，请稍后再试");
    } finally {
      setIsPublishing(false);
    }
  }

  function hasOldCode(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) return false;
    return !looksLikeStarterDraft(trimmed);
  }

  function shouldForceFullRegenerate(userPrompt: string): boolean {
    const text = userPrompt.trim().toLowerCase();
    if (!text) return false;
    const keywords = [
      "重新生成",
      "重做",
      "从头",
      "推倒重来",
      "全量",
      "重写",
      "regenerate",
      "rewrite",
      "from scratch",
      "start over",
    ];
    return keywords.some((kw) => text.includes(kw));
  }

  async function readSseStream(
    res: Response,
    onEvent: (event: string, payload: unknown) => void
  ) {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processFrame = (frame: string) => {
      if (!frame.trim()) return;
      const lines = frame.split("\n");
      let event = "message";
      let dataText = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataText += line.slice(5).trim();
      }
      let payload: unknown = null;
      try {
        payload = dataText ? JSON.parse(dataText) : null;
      } catch {
        payload = null;
      }
      onEvent(event, payload);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        const tail = buffer.replace(/\r/g, "");
        processFrame(tail);
        break;
      }
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) processFrame(frame);
    }
  }

  function assistByAi() {
    if (isAssisting) {
      abortByUserRef.current = true;
      abortRef.current?.abort();
      abortRef.current = null;
      setStatus("正在中断生成...");
      return;
    }

    const text = prompt.trim();
    if (!text) return;
    addMessage("user", text);
    setPrompt("");

    setIsAssisting(true);
    void (async () => {
      const forceFullRegenerate = shouldForceFullRegenerate(text);
      const useDiff = hasOldCode(draft) && !forceFullRegenerate;
      const modelPrompt = forceFullRegenerate
        ? [
            "【重生成模式】请忽略当前旧代码，直接从头输出完整可运行的 index.html。",
            "要求：保留用户本次需求，不要输出补丁，不要解释。",
            "",
            text,
          ].join("\n")
        : text;
      setPatchStreamDraft("");
      setPendingPatch(null);
      abortByUserRef.current = false;
      setStatus(
        useDiff
          ? "AI 正在生成 diff 补丁..."
          : forceFullRegenerate
            ? "检测到重生成指令，正在全量重写代码..."
            : "AI 正在流式生成完整代码..."
      );
      const assistantId = addMessage(
        "assistant",
        useDiff
          ? `我会基于当前 ${currentFile} 先生成最小补丁，再在编辑器里给你逐段 Apply/Reject。`
          : forceFullRegenerate
            ? "收到重生成指令，这次会全量重写，不走补丁。"
            : "我会先生成完整 index.html，并把草稿实时写入编辑器和预览。"
      );
      const controller = new AbortController();
      abortRef.current = controller;
      const progressId = addMessage(
        "system",
        useDiff
          ? `开始生成 ${currentFile}（补丁）...`
          : forceFullRegenerate
            ? "开始全量重生成 index.html..."
            : "开始生成 index.html..."
      );

      try {
        if (!useDiff) {
          setCurrentFile("index.html");
          setPreviewFile("index.html");
          let streamedHtml = "";
          let doneOk = false;
          let lastProgressAt = 0;
          let lastProgressLines = 0;
          const res = await fetch(
            `/api/spark/games/${gameId}/generate?stream=1`,
            {
              method: "POST",
              signal: controller.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: modelPrompt, persist: false }),
            }
          );
          if (!res.ok || !res.body) {
            const json = await res.json().catch(() => null);
            setStatus(errorToText(json?.error, "AI 生成失败"));
            return;
          }
          await readSseStream(res, (event, payload) => {
            if (event === "delta") {
              const p = payload as { text?: string } | null;
              const chunk = typeof p?.text === "string" ? p.text : "";
              if (chunk) {
                streamedHtml += chunk;
                setDraft(streamedHtml);
                const lineCount = estimateLineCount(streamedHtml);
                const now = Date.now();
                const canPublish =
                  now - lastProgressAt >= 650 ||
                  lineCount >= lastProgressLines + 8;
                if (canPublish) {
                  const phase = describeDraftPhase(streamedHtml);
                  updateMessage(
                    progressId,
                    phase
                      ? `正在编写 index.html... 草稿约 ${lineCount} 行，当前在补 ${phase}`
                      : `正在编写 index.html... 草稿约 ${lineCount} 行`
                  );
                  lastProgressAt = now;
                  lastProgressLines = lineCount;
                }
              }
            } else if (event === "error") {
              const p = payload as { message?: string } | null;
              const msg = p?.message || "AI 生成失败";
              setStatus(msg);
              updateMessage(assistantId, `生成失败：${msg}`);
              updateMessage(progressId, `✗ 生成失败：${msg}`);
            } else if (event === "done") {
              const p = payload as {
                html?: string;
                updated_at?: string;
              } | null;
              doneOk = true;
              const html = typeof p?.html === "string" ? p.html : streamedHtml;
              setDraft(html);
              setLocalSavedFiles((prev) => {
                const next = { ...prev, "index.html": html };
                writeLocalDraftCache(
                  localStorageKeyRef.current,
                  publishedBaseline,
                  next
                );
                return next;
              });
              const lineCount = estimateLineCount(html);
              updateMessage(progressId, `✓ 写入 index.html (${lineCount}行)`);
              updateMessage(assistantId, "完整代码生成完成，已写入编辑器。");
              setData((prev) => ({
                ...prev,
                files: { ...prev.files, "index.html": html },
              }));
            }
          });
          if (doneOk) {
            setPreviewToken((t) => t + 1);
            setStatus("首次生成完成，代码已流式写入编辑器");
            addMessage("system", "首次生成完成，代码已写入 index.html。");
          }
          return;
        }

        const res = await fetch(
          `/api/spark/games/${gameId}/propose-patch?stream=1`,
          {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: currentFile,
              prompt: text,
              content: draft,
            }),
          }
        );
        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => null);
          setStatus(errorToText(json?.error, "补丁生成失败"));
          return;
        }

        let streamedDiff = "";
        let donePayload: unknown = null;
        let failed = false;
        let lastProgressAt = 0;
        let lastProgressLines = 0;
        await readSseStream(res, (event, payload) => {
          if (event === "delta") {
            const p = payload as { text?: string } | null;
            const chunk = typeof p?.text === "string" ? p.text : "";
            if (chunk) {
              streamedDiff += chunk;
              setPatchStreamDraft((prev) => prev + chunk);
              const lineCount = estimateLineCount(streamedDiff);
              const now = Date.now();
              const canPublish =
                now - lastProgressAt >= 650 ||
                lineCount >= lastProgressLines + 8;
              if (canPublish) {
                updateMessage(
                  progressId,
                  `正在编写 ${currentFile}（补丁）... 草稿约 ${lineCount} 行`
                );
                lastProgressAt = now;
                lastProgressLines = lineCount;
              }
            }
          } else if (event === "error") {
            const p = payload as { message?: string } | null;
            failed = true;
            const msg = p?.message || "补丁生成失败";
            setStatus(msg);
            updateMessage(assistantId, `补丁生成失败：${msg}`);
            updateMessage(progressId, `✗ 补丁生成失败：${msg}`);
          } else if (event === "done") {
            donePayload = payload;
          }
        });
        if (failed || !donePayload) return;

        const p = donePayload as { diff?: string; hunks?: UnifiedDiffHunk[] };
        const diff = String(p.diff || streamedDiff || "");
        const hunks = Array.isArray(p.hunks) ? p.hunks : parseUnifiedDiff(diff);
        if (!hunks.length) {
          setStatus("未生成可应用补丁");
          updateMessage(assistantId, "未生成可应用补丁。");
          updateMessage(progressId, "✗ 未生成可应用补丁");
          return;
        }
        setPendingPatch({ path: currentFile, diff, hunks });
        setStatus(
          `已生成 diff：${hunks.length} 个 hunk，可在编辑器内逐段 Apply/Reject`
        );
        updateMessage(
          progressId,
          `✓ 生成 ${currentFile} 补丁 (${hunks.length} 个 hunk)`
        );
        updateMessage(
          assistantId,
          `已生成 ${hunks.length} 个 hunk，可在编辑器中逐段 Apply/Reject。`
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          const userAbort = abortByUserRef.current;
          setStatus(userAbort ? "已打断当前生成" : "生成已中断");
          updateMessage(
            assistantId,
            userAbort ? "已打断本次生成。" : "本次生成已中断。"
          );
          updateMessage(
            progressId,
            userAbort ? "已打断本次生成。" : "生成已中断。"
          );
          if (userAbort) addMessage("system", "已打断当前生成。");
          return;
        }
        setStatus("AI 处理失败，请稍后再试");
        updateMessage(assistantId, "AI 处理失败，请稍后再试。");
        updateMessage(progressId, "✗ AI 处理失败");
      } finally {
        abortByUserRef.current = false;
        abortRef.current = null;
        setIsAssisting(false);
      }
    })();
  }

  function applyHunk(targetIndex: number) {
    if (!pendingPatch) return;
    const hunk = pendingPatch.hunks.find((item) => item.index === targetIndex);
    if (!hunk) return;
    const next = applyOneHunkToText(draft, hunk);
    if (!next.ok) {
      setStatus("该 hunk 应用失败，建议重新生成");
      return;
    }
    setDraft(next.text);
    const hunks = pendingPatch.hunks.filter(
      (item) => item.index !== targetIndex
    );
    setPendingPatch(hunks.length ? { ...pendingPatch, hunks } : null);
    setStatus(
      hunks.length ? `已应用 1 个 hunk，剩余 ${hunks.length}` : "补丁已处理完"
    );
  }

  function rejectHunk(targetIndex: number) {
    if (!pendingPatch) return;
    const hunks = pendingPatch.hunks.filter(
      (item) => item.index !== targetIndex
    );
    setPendingPatch(hunks.length ? { ...pendingPatch, hunks } : null);
    setStatus(
      hunks.length ? `已拒绝 1 个 hunk，剩余 ${hunks.length}` : "补丁已处理完"
    );
  }

  function applyAllHunks() {
    if (!pendingPatch) return;
    let text = draft;
    let applied = 0;
    for (const hunk of pendingPatch.hunks) {
      const next = applyOneHunkToText(text, hunk);
      if (!next.ok) continue;
      text = next.text;
      applied += 1;
    }
    setDraft(text);
    setPendingPatch(null);
    setStatus(applied ? `已应用 ${applied} 个 hunk` : "没有可应用的 hunk");
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#070b14] text-slate-100">
      <style jsx global>{`
        .monaco-editor .diff-line-addition {
          background: rgba(46, 160, 67, 0.2) !important;
        }
        .monaco-editor .diff-line-addition-glyph {
          background: #2ea043 !important;
        }
        .monaco-editor .diff-line-deletion {
          background: rgba(248, 81, 73, 0.2) !important;
        }
        .monaco-editor .diff-line-deletion-glyph {
          background: #f85149 !important;
        }
        .diff-hunk-widget {
          background: #111827;
          border: 1px solid #374151;
          border-radius: 6px;
          padding: 2px 6px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
          font-family: system-ui, sans-serif;
          white-space: nowrap;
        }
        .diff-hunk-widget .diff-btn {
          border: 0;
          border-radius: 4px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          color: #fff;
          line-height: 1.3;
        }
        .diff-hunk-widget .diff-btn-apply {
          background: #16a34a;
        }
        .diff-hunk-widget .diff-btn-apply:hover {
          background: #22c55e;
        }
        .diff-hunk-widget .diff-btn-reject {
          background: #dc2626;
        }
        .diff-hunk-widget .diff-btn-reject:hover {
          background: #ef4444;
        }
        .studio-splitter {
          flex: 0 0 10px;
          width: 10px;
          cursor: col-resize;
          position: relative;
          background: rgba(51, 65, 85, 0.95);
          border-left: 1px solid rgba(71, 85, 105, 0.4);
          border-right: 1px solid rgba(71, 85, 105, 0.4);
          touch-action: none;
        }
        .studio-splitter::before {
          content: "";
          position: absolute;
          left: -8px;
          right: -8px;
          top: 0;
          bottom: 0;
        }
        .studio-splitter:hover {
          background: rgba(56, 189, 248, 0.9);
        }
      `}</style>

      <div className="flex h-full w-full flex-col px-4 py-4">
        <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3">
              <Link
                href="/games"
                className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-700 px-3 text-xs text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                返回我的游戏
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="truncate text-base font-semibold text-white">
                    {data.title}
                  </span>
                  <span className="rounded-full border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200">
                    {data.slug}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {pendingPatch ? "Diff 审阅模式" : "编辑模式"}
                  </span>
                  {hasUnpublishedChanges ? (
                    <span className="rounded-full border border-amber-300/45 bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-100">
                      未发布变更
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={undoEdit}
                disabled={Boolean(pendingPatch)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                aria-label="上一步"
                title="上一步"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
                  <path d="M9 6 3 12l6 6" />
                  <path d="M3 12h11a7 7 0 0 1 0 14h-3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={redoEdit}
                disabled={Boolean(pendingPatch)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                aria-label="下一步"
                title="下一步"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
                  <path d="m15 6 6 6-6 6" />
                  <path d="M21 12H10a7 7 0 0 0 0 14h3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={restoreInitialVersion}
                disabled={Boolean(pendingPatch)}
                className="rounded-full border border-amber-400/45 px-3 py-1.5 text-xs text-amber-200 transition hover:border-amber-300 hover:text-amber-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                还原初始版本
              </button>
              <button
                type="button"
                onClick={() => setIsPublishOpen(true)}
                disabled={Boolean(pendingPatch) || isPublishing}
                className="rounded-full border border-fuchsia-400/50 px-3 py-1.5 text-xs text-fuchsia-200 transition hover:border-fuchsia-300 hover:text-fuchsia-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                发布
              </button>
              <button
                type="button"
                onClick={saveCurrent}
                disabled={isSaving || Boolean(pendingPatch)}
                className="rounded-full border border-emerald-400/45 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-300 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {isSaving ? "保存中" : "保存(本地)"}
              </button>
              <button
                type="button"
                onClick={resetSplitLayout}
                className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                重置布局
              </button>
              <button
                type="button"
                onClick={() => setShowFilesPane((v) => !v)}
                className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                {showFilesPane ? "隐藏文件" : "显示文件"}
              </button>
            </div>
          </div>
          {status ? <div className="mt-2 text-xs text-slate-400">{status}</div> : null}
        </div>

        <div ref={splitRootRef} className="flex min-h-0 flex-1 items-stretch gap-0">
          {showFilesPane ? (
            <aside className="min-h-0 w-[140px] overflow-y-auto rounded-l-2xl border border-r-0 border-slate-800 bg-slate-900/70 p-2">
              <div className="mb-2 px-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                Files
              </div>
              <div className="space-y-1">
                {data.entries.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentFile(item)}
                    className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
                      item === currentFile
                        ? "bg-cyan-500/20 text-cyan-200"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                    title={item}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </aside>
          ) : null}

          <section
            className={`min-h-0 rounded-none border border-slate-800 bg-slate-900/70 ${showFilesPane ? "" : "rounded-l-2xl"}`}
            style={{ flex: `0 0 ${paneWidths.code}px` }}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <div className="text-xs text-slate-400">{currentFile}</div>
              <div className="flex items-center gap-2">
                {pendingPatch ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setPendingPatch(null)}
                      className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
                    >
                      Reject All
                    </button>
                    <button
                      type="button"
                      onClick={applyAllHunks}
                      className="rounded-full border border-fuchsia-400/40 px-3 py-1 text-xs text-fuchsia-200 transition hover:border-fuchsia-300 hover:text-fuchsia-100"
                    >
                      Apply All
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div
              ref={editorHostRef}
              className="h-[calc(100%-41px)] w-full"
            />
          </section>

          <div
            className="studio-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整代码区与预览区宽度"
            onPointerDown={(e) => startSplitDrag("code-preview", e)}
          />

          <section
            className="min-h-0 overflow-hidden rounded-none border border-slate-800 bg-slate-900/70"
            style={{ flex: `0 0 ${paneWidths.preview}px` }}
          >
            <div className="border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
              Live Preview · {previewFile}
            </div>
            <iframe
              title={`${data.title} preview`}
              src={previewDoc ? undefined : iframeSrc}
              srcDoc={previewDoc ?? undefined}
              className="h-[calc(100%-41px)] w-full bg-black"
            />
          </section>

          <div
            className="studio-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整预览区与聊天区宽度"
            onPointerDown={(e) => startSplitDrag("preview-chat", e)}
          />

          <section className="min-h-0 min-w-[260px] flex-1 overflow-hidden rounded-r-2xl border border-l-0 border-slate-800 bg-slate-900/70">
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
                Studio Chat
              </div>
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-3 py-3">
                <div className="space-y-2">
                  {messages.length === 0 ? (
                    <div className="text-xs text-slate-500">
                      在下方输入需求。首次会流式生成完整代码，后续会自动转为 diff 修改。
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${
                          m.role === "user"
                            ? "justify-end"
                            : m.role === "assistant"
                              ? "justify-start"
                              : "justify-center"
                        }`}
                      >
                        <div
                          className={`max-w-[84%] whitespace-pre-wrap break-words px-3 py-2 text-xs leading-5 ${
                            m.role === "user"
                              ? "rounded-2xl rounded-br-md bg-emerald-500/85 text-emerald-50"
                              : m.role === "assistant"
                                ? "rounded-2xl rounded-bl-md bg-slate-800 text-slate-100"
                                : "rounded-full border border-slate-700 bg-slate-900/80 px-4 py-1 text-[11px] text-slate-300"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="flex items-end gap-2 border-t border-slate-800 px-3 py-2">
                <textarea
                  ref={promptInputRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      assistByAi();
                    }
                  }}
                  placeholder="在这里输入需求..."
                  rows={1}
                  className="min-h-[36px] w-full resize-none rounded-2xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs leading-5 text-slate-100 outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={assistByAi}
                  disabled={!isAssisting && !prompt.trim()}
                  className="w-20 rounded-full bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {isAssisting ? "打断" : "发送"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
      {toastState ? (
        (() => {
          const tone = resolveToastTone(toastState.message);
          const toneClass =
            tone === "error"
              ? "border-rose-200/90 bg-rose-500 text-rose-50 shadow-[0_16px_48px_rgba(244,63,94,0.45)]"
              : tone === "warning"
                ? "border-amber-200/90 bg-amber-400 text-amber-950 shadow-[0_16px_48px_rgba(245,158,11,0.45)]"
                : tone === "success"
                  ? "border-emerald-200/90 bg-emerald-400 text-emerald-950 shadow-[0_16px_48px_rgba(16,185,129,0.45)]"
                  : "border-slate-300/70 bg-slate-500 text-slate-100 shadow-[0_16px_48px_rgba(100,116,139,0.45)]";
          return (
            <div
              key={toastState.id}
              className={`pointer-events-none fixed left-1/2 top-20 z-[70] -translate-x-1/2 rounded-full border px-5 py-2 text-sm font-semibold ${toneClass}`}
            >
              {toastState.message}
            </div>
          );
        })()
      ) : null}
      {isPublishOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-[0_30px_120px_rgba(2,6,23,0.8)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">发布游戏</h3>
              <button
                type="button"
                onClick={() => setIsPublishOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white"
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">版本号</span>
                <input
                  value={publishVersion}
                  onChange={(e) => setPublishVersion(e.target.value)}
                  placeholder="例如：v1.2.0"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-fuchsia-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">发布说明（可选）</span>
                <textarea
                  value={publishNote}
                  onChange={(e) => setPublishNote(e.target.value)}
                  rows={4}
                  placeholder="这次更新了什么..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-fuchsia-400"
                />
              </label>
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                确认发布后，当前本地保存的代码会同步到云端，并提交管理员审核。
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPublishOpen(false)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void publishToReview()}
                disabled={isPublishing || !publishVersion.trim()}
                className="rounded-full bg-fuchsia-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isPublishing ? "发布中..." : "确认发布"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
