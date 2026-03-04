"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

type LlamaParseTierOption = "fast" | "cost_effective" | "agentic" | "agentic_plus";
type ParseModeOption = "local" | "cloud";

const LLAMA_TIER_OPTIONS: Array<{ value: LlamaParseTierOption; label: string }> = [
  { value: "fast", label: "fast" },
  { value: "cost_effective", label: "cost_effective" },
  { value: "agentic", label: "agentic" },
  { value: "agentic_plus", label: "agentic_plus" },
];

const PARSE_MODE_OPTIONS: Array<{ value: ParseModeOption; label: string }> = [
  { value: "local", label: "本地解析" },
  { value: "cloud", label: "云端解析" },
];

export function ChatUploadModal({
  spaces,
  onClose,
  onUploaded,
}: {
  spaces: { spaceId: string; spaceName: string }[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [tab, setTab] = useState<"docs" | "data">("docs");
  const { user: authUser } = useAuth();
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => {
    return spaces[0]?.spaceId ?? "";
  });
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [llamaParseTier, setLlamaParseTier] = useState<LlamaParseTierOption>("cost_effective");
  const [parseMode, setParseMode] = useState<ParseModeOption>("local");
  const fileRef = useRef<HTMLInputElement>(null);

  const accept = tab === "docs" ? ".txt,.md,.pdf,.docx" : ".xlsx,.xls,.csv";

  async function handleFile(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("spaceId", selectedSpaceId);
      if (tab === "docs") {
        fd.append("title", file.name.replace(/\.[^.]+$/, ""));
        fd.append("llamaParseTier", llamaParseTier);
        fd.append("parseMode", parseMode);
      }

      const url = tab === "docs" ? "/api/documents" : "/api/data-tables";
      const res = await fetch(url, { method: "POST", body: fd });

      if (tab === "docs") {
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `上传失败 (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("上传失败：未收到服务器响应流");

        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        while (!done) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.stage === "done") {
                setUploadMsg({ ok: true, text: `${file.name} 上传成功` });
                onUploaded();
                done = true;
                break;
              }
              if (data.stage === "error") {
                throw new Error(data.message || "上传失败");
              }
            } catch (e) {
              if (e instanceof Error) throw e;
            }
          }
        }

        if (!done) {
          throw new Error("上传未完成，请稍后重试");
        }
      } else {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `上传失败 (${res.status})`);
        }
        setUploadMsg({ ok: true, text: `${file.name} 上传成功` });
        onUploaded();
      }
    } catch (err: any) {
      setUploadMsg({ ok: false, text: err.message || "上传失败" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const gradientFrom = tab === "docs" ? "from-indigo-500" : "from-emerald-500";
  const gradientTo = tab === "docs" ? "to-cyan-500" : "to-teal-500";
  const formats = tab === "docs"
    ? [
        { ext: "pdf", color: "text-red-600", bg: "bg-red-50 border-red-100" },
        { ext: "docx", color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
        { ext: "md", color: "text-violet-600", bg: "bg-violet-50 border-violet-100" },
        { ext: "txt", color: "text-slate-600", bg: "bg-slate-100 border-slate-200" },
      ]
    : [
        { ext: "xlsx", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
        { ext: "xls", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
        { ext: "csv", color: "text-teal-600", bg: "bg-teal-50 border-teal-100" },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header with gradient */}
        <div className={`px-6 pt-6 pb-4 bg-gradient-to-r ${gradientFrom} ${gradientTo}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M12 18v-6" />
                  <path d="m9 15 3-3 3 3" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">上传文件</h3>
                <p className="text-xs text-white/70 mt-0.5">上传到知识库，即可在对话中使用</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => { setTab("docs"); setUploadMsg(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                tab === "docs" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
              </svg>
              知识文档
            </button>
            <button
              onClick={() => { setTab("data"); setUploadMsg(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                tab === "data" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M7 7h10" /><path d="M7 12h10" /><path d="M7 17h10" />
              </svg>
              数据报表
            </button>
          </div>

          {/* Space selector */}
          <label className="block">
            <span className="text-xs font-medium text-slate-500 mb-1.5 block">目标空间</span>
            <select
              value={selectedSpaceId}
              onChange={(e) => setSelectedSpaceId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-colors"
            >
              {spaces.map((s) => (
                <option key={s.spaceId} value={s.spaceId}>{s.spaceName}</option>
              ))}
            </select>
          </label>
          {tab === "docs" && (
            <label className="block">
              <span className="text-xs font-medium text-slate-500 mb-1.5 block">解析方式</span>
              <select
                value={parseMode}
                onChange={(e) => setParseMode(e.target.value as ParseModeOption)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-colors"
              >
                {PARSE_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tab === "docs" && (
            <label className="block">
              <span className="text-xs font-medium text-slate-500 mb-1.5 block">LlamaParse Tier</span>
              <select
                value={llamaParseTier}
                onChange={(e) => setLlamaParseTier(e.target.value as LlamaParseTierOption)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-colors"
              >
                {LLAMA_TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !uploading && fileRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              dragOver
                ? tab === "docs"
                  ? "border-indigo-400 bg-indigo-50 shadow-md"
                  : "border-emerald-400 bg-emerald-50 shadow-md"
                : uploading
                ? tab === "docs"
                  ? "border-indigo-300 bg-indigo-50/50"
                  : "border-emerald-300 bg-emerald-50/50"
                : "border-slate-200 hover:border-indigo-300 hover:shadow-md"
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <span className={`w-10 h-10 border-[3px] rounded-full animate-spin ${
                  tab === "docs"
                    ? "border-indigo-200 border-t-indigo-500"
                    : "border-emerald-200 border-t-emerald-500"
                }`} />
                <p className="text-sm font-medium text-slate-600">
                  {tab === "docs" ? "正在解析并向量化文档..." : "正在解析数据表..."}
                </p>
              </div>
            ) : (
              <>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradientFrom} ${gradientTo} flex items-center justify-center shadow-sm mx-auto mb-3`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">拖拽文件到此处，或点击选择</p>
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {formats.map((f) => (
                    <span key={f.ext} className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${f.bg} ${f.color}`}>
                      .{f.ext}
                    </span>
                  ))}
                </div>
              </>
            )}
            <input ref={fileRef} type="file" accept={accept} onChange={onFileChange} className="hidden" />
          </div>

          {/* Upload result */}
          {uploadMsg && (
            <div className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${
              uploadMsg.ok
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}>
              <span className="text-base">{uploadMsg.ok ? "\u2713" : "!"}</span>
              <span className="flex-1">{uploadMsg.text}</span>
              {!authUser && !uploadMsg.ok && uploadMsg.text.includes("上限") && (
                <Link
                  href="/register"
                  className="shrink-0 px-3 py-1 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
                >
                  免费注册
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
