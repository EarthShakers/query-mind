"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { NavAuth } from "@/components/nav-auth";

interface DocItem {
  title: string;
  chunkCount: number;
  format: string;
  createdAt: string;
}

interface ChunkItem {
  id: number;
  content: string;
  created_at: string;
}

const FORMAT_FILTERS = [
  { label: "全部", value: "all" },
  { label: "PDF", value: "pdf" },
  { label: "Word", value: "docx" },
  { label: "Markdown", value: "md" },
  { label: "TXT", value: "txt" },
];

const FORMAT_META: Record<
  string,
  { icon: string; label: string; color: string; bg: string; gradient: string }
> = {
  pdf: {
    icon: "PDF",
    label: "PDF 文档",
    color: "text-red-600",
    bg: "bg-red-50 border-red-100",
    gradient: "from-red-500 to-rose-500",
  },
  docx: {
    icon: "DOC",
    label: "Word 文档",
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-100",
    gradient: "from-blue-500 to-indigo-500",
  },
  md: {
    icon: "MD",
    label: "Markdown",
    color: "text-violet-600",
    bg: "bg-violet-50 border-violet-100",
    gradient: "from-violet-500 to-purple-500",
  },
  txt: {
    icon: "TXT",
    label: "纯文本",
    color: "text-slate-600",
    bg: "bg-slate-100 border-slate-200",
    gradient: "from-slate-400 to-slate-500",
  },
};

export default function KnowledgePage() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    format: string;
  } | null>(null);
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) setDocs(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name.replace(/\.\w+$/, ""));
      const res = await fetch("/api/documents", { method: "POST", body: form });
      if (!res.ok) {
        setUploadMsg(await res.text());
      } else {
        const json = await res.json();
        setUploadMsg(`"${json.title}" 已导入（${json.chunks} 个片段）`);
        fetchDocs();
      }
    } catch {
      setUploadMsg("上传失败，请重试");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  async function openPreview(doc: DocItem) {
    setPreview({ title: doc.title, format: doc.format });
    setChunks([]);
    setChunksLoading(true);
    try {
      const res = await fetch(
        `/api/documents?title=${encodeURIComponent(doc.title)}`
      );
      if (res.ok) setChunks(await res.json());
    } catch {
      // ignore
    } finally {
      setChunksLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = docs;
    if (filter !== "all") list = list.filter((d) => d.format === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(q));
    }
    return list;
  }, [docs, filter, search]);

  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = { all: docs.length };
    for (const d of docs) {
      counts[d.format] = (counts[d.format] ?? 0) + 1;
    }
    return counts;
  }, [docs]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
          >
            QueryMind
          </Link>
          <div className="flex items-center gap-4 md:gap-6 text-sm">
            <Link
              href="/"
              className="text-slate-500 hover:text-slate-800 transition-colors"
            >
              首页
            </Link>
            <Link
              href="/chat"
              className="px-4 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              在线体验
            </Link>
            <NavAuth />
          </div>
        </div>
      </nav>

      {/* Hero Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 text-white">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-14">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
              </svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">知识库</h1>
          </div>
          <p className="text-indigo-100 text-sm md:text-base max-w-lg">
            上传企业文档，AI 自动解析、切片、向量化。在对话中提问时，AI
            会检索最相关的内容来回答。
          </p>
          {/* Stats */}
          {!loading && docs.length > 0 && (
            <div className="flex items-center gap-6 mt-6">
              <div>
                <p className="text-2xl font-bold">{docs.length}</p>
                <p className="text-xs text-indigo-200">篇文档</p>
              </div>
              <div className="w-px h-8 bg-white/20" />
              <div>
                <p className="text-2xl font-bold">
                  {docs.reduce((s, d) => s + d.chunkCount, 0)}
                </p>
                <p className="text-xs text-indigo-200">个片段</p>
              </div>
              <div className="w-px h-8 bg-white/20" />
              <div>
                <p className="text-2xl font-bold">
                  {new Set(docs.map((d) => d.format)).size}
                </p>
                <p className="text-xs text-indigo-200">种格式</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 -mt-6">
        {/* Upload Card */}
        <div
          className={`relative rounded-2xl border-2 border-dashed bg-white shadow-lg shadow-slate-200/50 transition-all cursor-pointer ${
            dragOver
              ? "border-indigo-400 bg-indigo-50 shadow-indigo-100"
              : uploading
              ? "border-indigo-300 bg-indigo-50/50"
              : "border-slate-200 hover:border-indigo-300 hover:shadow-xl"
          }`}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
            className="hidden"
          />
          <div className="flex flex-col sm:flex-row items-center gap-5 py-8 px-8">
            {uploading ? (
              <span className="w-12 h-12 border-[3px] border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-200/50 shrink-0">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
            )}
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-slate-800">
                {uploading
                  ? "正在解析并向量化文档..."
                  : "拖拽文件到此处，或点击选择文件"}
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mt-2.5">
                {Object.entries(FORMAT_META).map(([ext, meta]) => (
                  <span
                    key={ext}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${meta.bg} ${meta.color}`}
                  >
                    .{ext}
                  </span>
                ))}
                <span className="text-[11px] text-slate-400">最大 20MB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Upload message */}
        {uploadMsg && (
          <div
            className={`mt-3 px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
              uploadMsg.includes("已导入")
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}
          >
            <span className="text-base">
              {uploadMsg.includes("已导入") ? "✓" : "!"}
            </span>
            {uploadMsg}
          </div>
        )}

        {/* Search + Filter */}
        <div className="mt-8 mb-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索文档名称..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-400"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {FORMAT_FILTERS.map((f) => {
              const count = formatCounts[f.value] ?? 0;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`shrink-0 px-3.5 py-2 text-xs font-medium rounded-lg transition-all ${
                    filter === f.value
                      ? "bg-indigo-500 text-white shadow-md shadow-indigo-200"
                      : "bg-white border border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600 shadow-sm"
                  }`}
                >
                  {f.label}
                  {count > 0 && (
                    <span
                      className={`ml-1 ${
                        filter === f.value
                          ? "text-indigo-200"
                          : "text-slate-300"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Document Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-slate-300"
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              </svg>
            </div>
            <p className="text-sm text-slate-500 font-medium">
              {search
                ? `未找到包含"${search}"的文档`
                : filter === "all"
                ? "还没有上传任何文档"
                : `暂无 ${
                    FORMAT_FILTERS.find((f) => f.value === filter)?.label
                  } 格式的文档`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {filter === "all" && !search
                ? "点击上方区域上传你的第一篇文档"
                : ""}
            </p>
            {(search || filter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
                className="mt-4 px-4 py-1.5 text-sm text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                清除筛选
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
            {filtered.map((doc) => {
              const meta = FORMAT_META[doc.format] ?? FORMAT_META.txt;
              return (
                <div
                  key={doc.title}
                  onClick={() => openPreview(doc)}
                  className="group relative bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 shadow-sm hover:shadow-lg hover:shadow-indigo-50 transition-all cursor-pointer overflow-hidden"
                >
                  {/* Color top bar */}
                  <div className={`h-1 bg-gradient-to-r ${meta.gradient}`} />
                  <div className="p-5">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center text-[11px] font-bold text-white shadow-sm`}
                      >
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                          {doc.title}
                        </p>
                        <div className="flex items-center gap-3 mt-2.5">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                              <path d="M14 2v6h6" />
                            </svg>
                            {doc.chunkCount} 个片段
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                width="18"
                                height="18"
                                x="3"
                                y="4"
                                rx="2"
                                ry="2"
                              />
                              <line x1="16" x2="16" y1="2" y2="6" />
                              <line x1="8" x2="8" y1="2" y2="6" />
                              <line x1="3" x2="21" y1="10" y2="10" />
                            </svg>
                            {new Date(doc.createdAt).toLocaleDateString(
                              "zh-CN"
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Hover hint */}
                  <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[11px] text-indigo-400 font-medium">
                      点击预览 →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className={`bg-gradient-to-r ${
                (FORMAT_META[preview.format] ?? FORMAT_META.txt).gradient
              } px-6 py-5`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center text-xs font-bold text-white">
                    {(FORMAT_META[preview.format] ?? FORMAT_META.txt).icon}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-white truncate">
                      {preview.title}
                    </h2>
                    <p className="text-xs text-white/70 mt-0.5">
                      {(FORMAT_META[preview.format] ?? FORMAT_META.txt).label}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreview(null)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition-colors"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {chunksLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                  <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
                  <span className="text-sm">加载中...</span>
                </div>
              ) : chunks.length === 0 ? (
                <p className="text-center py-16 text-sm text-slate-400">
                  暂无内容
                </p>
              ) : (
                <div className="space-y-3">
                  {chunks.map((chunk, i) => (
                    <div
                      key={chunk.id}
                      className="rounded-xl border border-slate-200 overflow-hidden hover:border-indigo-200 transition-colors"
                    >
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-50/80 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded-md bg-gradient-to-br ${
                              (FORMAT_META[preview.format] ?? FORMAT_META.txt)
                                .gradient
                            } flex items-center justify-center text-[9px] font-bold text-white`}
                          >
                            {i + 1}
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            Chunk #{i + 1}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">
                          {chunk.content.length} 字
                        </span>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {chunk.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  {chunks.length} 个片段
                </span>
                <span>
                  共 {chunks.reduce((s, c) => s + c.content.length, 0)} 字
                </span>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
