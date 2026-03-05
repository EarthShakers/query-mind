"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { NavAuth } from "@/components/nav-auth";
import { useAuth } from "@/lib/auth-context";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface DocItem {
  title: string;
  chunkCount: number;
  format: string;
  createdAt: string;
}

interface ChunkItem {
  id: number;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

const MAX_CHUNK_LEVEL = 6;

interface ChunkTreeNode {
  key: string;
  label: string;
  level: number;
  children: ChunkTreeNode[];
  chunks: ChunkItem[];
}

function buildChunkTree(chunks: ChunkItem[], maxLevel = MAX_CHUNK_LEVEL): ChunkTreeNode {
  const root: ChunkTreeNode = { key: "", label: "", level: 0, children: [], chunks: [] };

  for (const chunk of chunks) {
    const section = chunk.metadata?.section;
    const parts =
      typeof section === "string"
        ? section
            .split(" > ")
            .map((p) => p.trim())
            .filter(Boolean)
            .slice(0, maxLevel)
        : [];

    if (parts.length === 0) {
      root.chunks.push(chunk);
    } else {
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const label = parts[i];
        const key = parts.slice(0, i + 1).join(" > ");
        let child = current.children.find((c) => c.key === key);
        if (!child) {
          child = { key, label, level: i + 1, children: [], chunks: [] };
          current.children.push(child);
        }
        current = child;
        if (i === parts.length - 1) {
          current.chunks.push(chunk);
        }
      }
    }
  }

  return root;
}

function ChunkCard({
  chunk,
  index,
  format,
}: {
  chunk: ChunkItem;
  index: number;
  format: string;
}) {
  const summary =
    typeof chunk.metadata?.summary === "string" ? chunk.metadata.summary : undefined;
  const meta = FORMAT_META[format] ?? FORMAT_META.txt;
  return (
    <div
      key={chunk.id}
      className="rounded-xl border border-slate-200 overflow-hidden hover:border-indigo-200 transition-colors"
    >
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50/80 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span
            className={`w-5 h-5 rounded-md bg-gradient-to-br ${meta.gradient} flex items-center justify-center text-[9px] font-bold text-white`}
          >
            {index + 1}
          </span>
          <span className="text-xs font-medium text-slate-500">Chunk #{index + 1}</span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">
          {chunk.content.length} 字
        </span>
      </div>
      {summary && (
        <div className="px-4 py-2 bg-indigo-50/50 border-b border-indigo-100/50">
          <p className="text-[11px] text-indigo-700 leading-relaxed">
            <span className="font-medium text-indigo-600">摘要：</span>
            {summary}
          </p>
        </div>
      )}
      <div className="px-4 py-3 prose prose-sm prose-slate max-w-none prose-table:text-xs prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:border-slate-200 prose-th:border-slate-200">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          allowedElements={MARKDOWN_ALLOWED_ELEMENTS}
          unwrapDisallowed
          components={MARKDOWN_COMPONENTS}
        >
          {normalizeMarkdownHighlights(chunk.content)}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function ChunkTreeItem({
  node,
  format,
  chunkIndexRef,
}: {
  node: ChunkTreeNode;
  format: string;
  chunkIndexRef: React.MutableRefObject<number>;
}) {
  const indentPx = Math.min(node.level * 16, MAX_CHUNK_LEVEL * 16);
  return (
    <div className="space-y-2">
      {node.label ? (
        <div
          className="text-xs font-semibold text-slate-600 py-1.5 border-l-2 border-indigo-200 pl-3 bg-slate-50/50 rounded-r"
          style={{ marginLeft: indentPx }}
        >
          {node.label}
        </div>
      ) : null}
      {node.chunks.map((chunk) => {
        const i = chunkIndexRef.current++;
        return <ChunkCard key={chunk.id} chunk={chunk} index={i} format={format} />;
      })}
      {node.children.map((child) => (
        <ChunkTreeItem
          key={child.key}
          node={child}
          format={format}
          chunkIndexRef={chunkIndexRef}
        />
      ))}
    </div>
  );
}

function ChunkTreeView({ chunks, format }: { chunks: ChunkItem[]; format: string }) {
  const chunkIndexRef = useRef(0);
  const tree = useMemo(() => buildChunkTree(chunks), [chunks]);
  chunkIndexRef.current = 0;

  return (
    <div className="space-y-3">
      {tree.chunks.map((chunk) => {
        const i = chunkIndexRef.current++;
        return <ChunkCard key={chunk.id} chunk={chunk} index={i} format={format} />;
      })}
      {tree.children.map((child) => (
        <ChunkTreeItem
          key={child.key}
          node={child}
          format={format}
          chunkIndexRef={chunkIndexRef}
        />
      ))}
    </div>
  );
}

interface DataTableItem {
  id: string;
  table_name: string;
  display_name: string;
  description: string | null;
  row_count: number;
  file_name: string;
  created_at: string;
  columnCount: number;
}

interface SpaceCard {
  spaceId: string;
  spaceName: string;
  role: "admin" | "editor" | "viewer" | null;
  isDefault?: boolean;
  memberCount?: number;
}

type LlamaParseTierOption = "fast" | "cost_effective" | "agentic" | "agentic_plus";
type ParseModeOption = "local" | "smart" | "cloud";

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

const ROLE_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  admin: { text: "管理员", color: "text-indigo-600", bg: "bg-indigo-50" },
  editor: { text: "编辑者", color: "text-emerald-600", bg: "bg-emerald-50" },
  viewer: { text: "查看者", color: "text-slate-500", bg: "bg-slate-100" },
};

const LLAMA_TIER_OPTIONS: Array<{ value: LlamaParseTierOption; label: string }> = [
  { value: "fast", label: "fast" },
  { value: "cost_effective", label: "cost_effective" },
  { value: "agentic", label: "agentic" },
  { value: "agentic_plus", label: "agentic_plus" },
];

const PARSE_MODE_OPTIONS: Array<{ value: ParseModeOption; label: string }> = [
  { value: "local", label: "本地解析" },
  { value: "smart", label: "智能解析" },
  { value: "cloud", label: "云端解析" },
];

type ChunkStrategyOption = "standard" | "parentChild" | "semantic";
const CHUNK_STRATEGY_OPTIONS: Array<{ value: ChunkStrategyOption; label: string }> = [
  { value: "standard", label: "标准切分" },
  { value: "parentChild", label: "精细切分（父子）" },
  { value: "semantic", label: "语义边界" },
];

const MARKDOWN_ALLOWED_ELEMENTS = [
  "p",
  "br",
  "blockquote",
  "code",
  "pre",
  "em",
  "strong",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "span",
  "mark",
] as const;

const MARKDOWN_COMPONENTS: Components = {
  // Avoid <p> nesting from mixed markdown + raw html content.
  p: ({ node, ...props }) => <div {...props} />,
  // Render images with responsive styling and fallback alt display.
  img: ({ node, src, alt, ...props }) => (
    <span className="block my-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        className="max-w-full rounded-lg border border-slate-200 shadow-sm"
        loading="lazy"
        onError={(e) => {
          const target = e.currentTarget;
          target.style.display = "none";
          const fallback = target.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = "inline";
        }}
        {...props}
      />
      <span
        className="hidden text-xs text-slate-400 italic"
        aria-label={alt ?? ""}
      >
        [{alt ?? "图片"}]
      </span>
    </span>
  ),
};

function normalizeMarkdownHighlights(markdown: string): string {
  // Support common highlight syntax: ==text== -> <mark>text</mark>
  return markdown.replace(/==([^=\n][^=\n]*?)==/g, "<mark>$1</mark>");
}

/* ─── Nav (shared) ─── */
function Nav() {
  return (
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
            className="px-4 py-1.5 text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            在线体验
          </Link>
          <NavAuth />
        </div>
      </div>
    </nav>
  );
}

/* ─── Space Switcher Dropdown ─── */
function SpaceSwitcher({
  spaces,
  currentSpaceId,
  onSwitch,
}: {
  spaces: SpaceCard[];
  currentSpaceId: string;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        切换空间
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50">
          {spaces.map((s) => (
            <button
              key={s.spaceId}
              onClick={() => {
                onSwitch(s.spaceId);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors ${
                s.spaceId === currentSpaceId
                  ? "text-indigo-600 font-medium bg-indigo-50/50"
                  : "text-slate-700"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  s.spaceId === currentSpaceId
                    ? "bg-gradient-to-br from-indigo-500 to-cyan-500 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {s.spaceName[0]}
              </div>
              <span className="truncate">{s.spaceName}</span>
              {s.spaceId === currentSpaceId && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-auto shrink-0"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Space List (Level 1) ─── */
function SpaceList({
  spaces,
  onSelect,
  user,
  onRefresh,
}: {
  spaces: SpaceCard[];
  onSelect: (id: string) => void;
  user: { tenantId: string; tenantRole: "admin" | "member" | null };
  onRefresh: () => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = spaces
      .map((s) => s.spaceId);
    if (ids.length === 0) return;
    fetch(`/api/spaces/member-counts?ids=${ids.join(",")}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setMemberCounts)
      .catch(() => {});
  }, [spaces]);

  async function handleDelete(spaceId: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "删除失败");
      } else {
        setConfirmDelete(null);
        await onRefresh();
      }
    } catch {
      alert("删除失败");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRename(spaceId: string) {
    if (!renameValue.trim()) return;
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "重命名失败");
      } else {
        setRenaming(null);
        setRenameValue("");
        await onRefresh();
      }
    } catch {
      alert("重命名失败");
    } finally {
      setRenameSaving(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/tenants/${user.tenantId}/spaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "创建失败");
      } else {
        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        await onRefresh();
      }
    } catch {
      setError("创建失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-12">
      {/* Compact gradient header */}
      <div className="mt-5 mb-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">知识库</h1>
              <p className="text-xs text-indigo-100 mt-0.5">
                选择空间管理文档，AI 自动解析向量化
              </p>
            </div>
          </div>
          {spaces.length > 0 && (
            <span className="text-sm font-medium text-white/70">
              {spaces.length} 个空间
            </span>
          )}
        </div>
      </div>

      {/* Create Space Card (admin only) */}
      {user.tenantRole === "admin" &&
        (showCreate ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">
              创建新空间
            </h3>
            <div className="space-y-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="空间名称"
                autoFocus
                className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-400"
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="空间描述（可选）"
                className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-400"
              />
              {error && (
                <div className="px-4 py-2.5 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">
                  {error}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-indigo-200/50 disabled:opacity-40 transition-all"
                >
                  {creating ? "创建中..." : "确认创建"}
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setError("");
                  }}
                  className="px-5 py-2.5 text-slate-500 text-sm rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setShowCreate(true)}
            className="bg-white rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all mb-5"
          >
            <div className="flex items-center gap-4 py-5 px-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  创建新空间
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  为不同项目或团队创建独立的数据空间
                </p>
              </div>
            </div>
          </div>
        ))}

      {/* Space Cards Grid */}
      {spaces.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-300"
            >
              <rect width="7" height="7" x="3" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="3" y="14" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" />
            </svg>
          </div>
          <p className="text-sm text-slate-500 font-medium">暂无可访问的空间</p>
          <p className="text-xs text-slate-400 mt-1">
            请联系管理员为你分配空间
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.map((space) => {
            const roleInfo = space.role ? ROLE_LABELS[space.role] : null;
            const count = memberCounts[space.spaceId];
            const canManage = user.tenantRole === "admin" || space.role === "admin";
            return (
              <div
                key={space.spaceId}
                onClick={() => onSelect(space.spaceId)}
                className="group relative bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 shadow-sm hover:shadow-lg hover:shadow-indigo-50 transition-all cursor-pointer overflow-hidden flex flex-col"
              >
                <div className="h-1 bg-slate-100 group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-cyan-400 transition-all" />
                <div className="p-5 flex-1">
                  {/* Member count — top right */}
                  {count !== undefined && (
                    <div className="float-right ml-2 flex items-center gap-1 text-xs text-slate-400">
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
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      {count}
                    </div>
                  )}
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-gradient-to-br group-hover:from-indigo-500 group-hover:to-cyan-500 flex items-center justify-center text-sm font-bold text-slate-500 group-hover:text-white transition-all shrink-0">
                      {space.spaceName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">
                        {space.spaceName}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {space.isDefault && (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 rounded-md border border-amber-100">
                            默认
                          </span>
                        )}
                        {roleInfo && (
                          <span
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-md border ${roleInfo.bg} ${roleInfo.color} border-current/10`}
                          >
                            {roleInfo.text}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Action bar — separate from content, no overlap */}
                <div className="px-5 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canManage && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenaming(space.spaceId);
                            setRenameValue(space.spaceName);
                          }}
                          className="text-[11px] text-slate-400 hover:text-slate-600 font-medium transition-colors"
                        >
                          重命名
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(space.spaceId);
                          }}
                          className="text-[11px] text-red-400 hover:text-red-600 font-medium transition-colors"
                        >
                          删除
                        </button>
                      </>
                    )}
                  </div>
                  <span className="text-[11px] text-indigo-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    进入空间 →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              确认删除空间
            </h3>
            <p className="text-sm text-slate-500 mb-1">
              删除后，该空间下的所有文档和成员关系将被永久清除，此操作不可撤销。
            </p>
            <p className="text-sm font-medium text-slate-700 mb-5">
              空间：{spaces.find((s) => s.spaceId === confirmDelete)?.spaceName}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename dialog */}
      {renaming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !renameSaving && setRenaming(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 mb-4">
              重命名空间
            </h3>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim()) handleRename(renaming);
              }}
              className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-400 mb-4"
              placeholder="输入新名称"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRenaming(null)}
                disabled={renameSaving}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleRename(renaming)}
                disabled={renameSaving || !renameValue.trim()}
                className="px-4 py-2 text-sm text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg disabled:opacity-50 transition-colors"
              >
                {renameSaving ? "保存中..." : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
/* ─── Data Tables Section ─── */
function DataTablesSection({
  spaceId,
  canUpload,
}: {
  spaceId: string;
  canUpload: boolean;
}) {
  const [tables, setTables] = useState<DataTableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewTable, setPreviewTable] = useState<{
    id: string;
    displayName: string;
    tableName: string;
    rowCount: number;
  } | null>(null);
  const [previewData, setPreviewData] = useState<{
    columns: { column_name: string; display_name: string; data_type: string }[];
    rows: Record<string, unknown>[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data-tables?spaceId=${encodeURIComponent(spaceId)}`);
      if (res.ok) setTables(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("spaceId", spaceId);
      const res = await fetch("/api/data-tables", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setUploadMsg(data.error || "上传失败");
      } else {
        setUploadMsg(`"${data.displayName}" 已导入（${data.rowCount} 行 × ${data.columns.length} 列）`);
        fetchTables();
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

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/data-tables/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "删除失败");
      } else {
        setConfirmDelete(null);
        fetchTables();
      }
    } catch {
      alert("删除失败");
    } finally {
      setDeleting(false);
    }
  }

  async function openPreview(table: DataTableItem) {
    setPreviewTable({
      id: table.id,
      displayName: table.display_name,
      tableName: table.table_name,
      rowCount: table.row_count,
    });
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/data-tables/${table.id}?preview=true`);
      if (res.ok) {
        const data = await res.json();
        setPreviewData({ columns: data.columns || [], rows: data.rows || [] });
      }
    } catch {
      // ignore
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div>
      {/* Upload Card */}
      {canUpload && (
        <div className="mb-5">
          <div
            className={`relative rounded-2xl border-2 border-dashed bg-white transition-all cursor-pointer ${
              dragOver
                ? "border-emerald-400 bg-emerald-50 shadow-md"
                : uploading
                ? "border-emerald-300 bg-emerald-50/50"
                : "border-slate-200 hover:border-emerald-300 hover:shadow-md"
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
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
              className="hidden"
            />
            <div className="flex flex-col sm:flex-row items-center gap-4 py-6 px-6">
              {uploading ? (
                <span className="w-10 h-10 border-[3px] border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm shrink-0">
                  <svg
                    width="20"
                    height="20"
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
                <p className="text-sm font-medium text-slate-700">
                  {uploading
                    ? "正在解析并导入数据..."
                    : "拖拽 Excel/CSV 文件到此处，或点击选择"}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mt-2">
                  {["xlsx", "xls", "csv"].map((ext) => (
                    <span
                      key={ext}
                      className="px-1.5 py-0.5 text-[10px] font-semibold rounded border bg-emerald-50 border-emerald-100 text-emerald-600"
                    >
                      .{ext}
                    </span>
                  ))}
                  <span className="text-[10px] text-slate-400">
                    AI 自动识别表结构，支持在对话中查询分析
                  </span>
                </div>
              </div>
            </div>
          </div>

          {uploadMsg && (
            <div
              className={`mt-3 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${
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
        </div>
      )}

      {/* Data Tables Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin mr-3" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-300"
            >
              <path d="M3 3h18v18H3z" />
              <path d="M3 9h18" />
              <path d="M3 15h18" />
              <path d="M9 3v18" />
            </svg>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            还没有上传数据报表
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {canUpload
              ? "上传 Excel 或 CSV 文件，AI 自动建表，可在对话中直接查询分析"
              : "暂无数据报表"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
          {tables.map((table) => (
            <div
              key={table.id}
              className="group relative bg-white rounded-2xl border border-slate-200 hover:border-emerald-200 shadow-sm hover:shadow-lg hover:shadow-emerald-50 transition-all overflow-hidden cursor-pointer"
              onClick={() => openPreview(table)}
            >
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <div className="p-5">
                <div className="flex items-start gap-3.5">
                  <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-[11px] font-bold text-white shadow-sm">
                    XLS
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">
                      {table.display_name}
                    </p>
                    <div className="flex items-center gap-3 mt-2.5">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3h18v18H3z" />
                          <path d="M3 9h18" />
                          <path d="M9 3v18" />
                        </svg>
                        {table.row_count} 行
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3v18" />
                          <path d="M3 12h18" />
                        </svg>
                        {table.columnCount} 列
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        {new Date(table.created_at).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                    {table.description && (
                      <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                        {table.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {/* Delete button */}
              {canUpload && (
                <div className="px-5 pb-4 flex justify-between items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(table.id); }}
                    className="text-[11px] text-red-400 hover:text-red-600 font-medium transition-colors opacity-0 group-hover:opacity-100"
                  >
                    删除
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {table.table_name}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              确认删除数据表
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              删除后，该数据表及所有数据将被永久清除，AI 将无法再查询此报表。此操作不可撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Table Preview Modal */}
      {previewTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewTable(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center text-xs font-bold text-white">
                    XLS
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-white truncate">
                      {previewTable.displayName}
                    </h2>
                    <p className="text-xs text-white/70 mt-0.5">
                      {previewTable.rowCount} 行 · 表名: {previewTable.tableName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewTable(null)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Modal Body — Table */}
            <div className="flex-1 overflow-auto">
              {previewLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                  <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin mr-3" />
                  <span className="text-sm">加载数据中...</span>
                </div>
              ) : !previewData || previewData.rows.length === 0 ? (
                <p className="text-center py-16 text-sm text-slate-400">
                  暂无数据
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                        #
                      </th>
                      {previewData.columns.map((col) => (
                        <th
                          key={col.column_name}
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap"
                        >
                          <div>{col.display_name}</div>
                          {col.display_name !== col.column_name && (
                            <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                              {col.column_name}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                          {ri + 1}
                        </td>
                        {previewData.columns.map((col) => (
                          <td
                            key={col.column_name}
                            className="px-4 py-2.5 text-slate-700 whitespace-nowrap max-w-[240px] truncate"
                          >
                            {row[col.column_name] != null
                              ? String(row[col.column_name])
                              : <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-slate-400">
                {previewData && (
                  <>
                    <span>{previewData.columns.length} 列</span>
                    <span>
                      显示前 {previewData.rows.length} 行
                      {previewTable.rowCount > 50 && `（共 ${previewTable.rowCount} 行）`}
                    </span>
                  </>
                )}
              </div>
              <button
                onClick={() => setPreviewTable(null)}
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

function SpaceDocuments({
  spaceId,
  spaceName,
  spaceRole,
  spaces,
  onBack,
  onSwitch,
  isAdmin,
  isDefault,
  isLoggedIn,
}: {
  spaceId: string;
  spaceName: string;
  spaceRole: "admin" | "editor" | "viewer" | null;
  spaces: SpaceCard[];
  onBack: () => void;
  onSwitch: (id: string) => void;
  isAdmin: boolean;
  isDefault: boolean;
  isLoggedIn: boolean;
}) {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{
    stage: string;
    message?: string;
    current?: number;
    total?: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    format: string;
  } | null>(null);
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<"chunks" | "markdown">("markdown");
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"docs" | "data">("docs");
  const [llamaParseTier, setLlamaParseTier] = useState<LlamaParseTierOption>("cost_effective");
  const [parseMode, setParseMode] = useState<ParseModeOption>("smart");
  const [chunkStrategy, setChunkStrategy] = useState<ChunkStrategyOption>("standard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [parentChunkSizeStr, setParentChunkSizeStr] = useState("800");
  const [parentOverlapStr, setParentOverlapStr] = useState("100");
  const [childChunkSizeStr, setChildChunkSizeStr] = useState("300");
  const [childOverlapStr, setChildOverlapStr] = useState("50");

  const parseParentChunkSize = () =>
    Math.min(1200, Math.max(400, parseInt(parentChunkSizeStr, 10) || 800));
  const parseParentOverlap = () =>
    Math.min(parseParentChunkSize() - 50, Math.max(0, parseInt(parentOverlapStr, 10) || 0));
  const parseChildChunkSize = () =>
    Math.min(600, Math.max(100, parseInt(childChunkSizeStr, 10) || 300));
  const parseChildOverlap = () =>
    Math.min(parseChildChunkSize() - 20, Math.max(0, parseInt(childOverlapStr, 10) || 0));

  useEffect(() => {
    const pOverlap = parseInt(parentOverlapStr, 10);
    if (!isNaN(pOverlap) && pOverlap >= parseParentChunkSize() - 50) {
      setParentOverlapStr(String(Math.max(0, parseParentChunkSize() - 50)));
    }
  }, [parentChunkSizeStr]);

  useEffect(() => {
    if (chunkStrategy === "parentChild") {
      const cOverlap = parseInt(childOverlapStr, 10);
      if (!isNaN(cOverlap) && cOverlap >= parseChildChunkSize() - 20) {
        setChildOverlapStr(String(Math.max(0, parseChildChunkSize() - 20)));
      }
    }
  }, [chunkStrategy, childChunkSizeStr]);

  const canUpload =
    spaceRole === "admin" || spaceRole === "editor" || isAdmin;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents?spaceId=${encodeURIComponent(spaceId)}`);
      if (res.ok) setDocs(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadMsg("");
    setUploadProgress(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name.replace(/\.\w+$/, ""));
      form.append("spaceId", spaceId);
      form.append("llamaParseTier", llamaParseTier);
      form.append("parseMode", parseMode);
      form.append("chunkStrategy", chunkStrategy);
      form.append("parentChunkSize", String(parseParentChunkSize()));
      form.append("parentOverlap", String(parseParentOverlap()));
      if (chunkStrategy === "parentChild") {
        form.append("childChunkSize", String(parseChildChunkSize()));
        form.append("childOverlap", String(parseChildOverlap()));
      }
      const res = await fetch("/api/documents", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      // Non-SSE error responses (validation errors return JSON)
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const body = await res.json().catch(() => null);
        setUploadMsg(body?.error || `上传失败 (${res.status})`);
        return;
      }

      // Read SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            setUploadProgress(data);

            if (data.stage === "done") {
              setUploadMsg(`"${data.title}" 已导入（${data.chunks} 个片段）`);
              setUploadProgress(null);
              fetchDocs();
            } else if (data.stage === "error") {
              setUploadMsg(data.message || "上传失败");
              setUploadProgress(null);
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setUploadMsg("上传已取消");
      } else {
        setUploadMsg("上传失败，请重试");
      }
      setUploadProgress(null);
    } finally {
      setUploading(false);
      abortRef.current = null;
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
        `/api/documents?title=${encodeURIComponent(doc.title)}&spaceId=${encodeURIComponent(spaceId)}`
      );
      if (res.ok) setChunks(await res.json());
    } catch {
      // ignore
    } finally {
      setChunksLoading(false);
    }
  }

  async function handleDeleteDoc(title: string) {
    setDeletingDoc(true);
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, spaceId }),
      });
      if (res.ok) {
        setConfirmDeleteDoc(null);
        setPreview(null);
        fetchDocs();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || "删除失败");
      }
    } catch {
      alert("删除失败");
    } finally {
      setDeletingDoc(false);
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
    <>
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        {/* Compact gradient header card */}
        <div className="mt-5 mb-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 px-4 sm:px-6 py-4 sm:py-5">
          {/* Row 1: back + name + switcher */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onBack}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
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
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-xs font-bold text-white shrink-0">
              {spaceName[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white truncate">
                  {spaceName}
                </h1>
                {spaceRole && (
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-medium bg-white/20 text-white rounded-md">
                    {ROLE_LABELS[spaceRole]?.text ?? spaceRole}
                  </span>
                )}
              </div>
              {!loading && docs.length > 0 && (
                <p className="text-[11px] sm:text-xs text-indigo-100 mt-0.5 truncate">
                  {docs.length} 篇文档 · {docs.reduce((s, d) => s + d.chunkCount, 0)} 个片段
                </p>
              )}
            </div>
            <SpaceSwitcher
              spaces={spaces}
              currentSpaceId={spaceId}
              onSwitch={onSwitch}
            />
          </div>
          {/* Row 2: action buttons */}
          <div className="flex items-center gap-2 mt-3 ml-10 sm:ml-[68px]">
            <Link
              href="/chat"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              去提问
            </Link>
            {isAdmin && (
              <Link
                href={`/spaces/${spaceId}/members`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                成员
              </Link>
            )}
          </div>
        </div>

        {/* Register prompt for anonymous users */}
        {!isLoggedIn && (
          <div className="mt-1 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-100 text-sm text-indigo-700">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
            <span>当前为预置文档（只读），注册后可上传自己的文档和报表。</span>
            <Link
              href="/register"
              className="shrink-0 ml-auto px-3 py-1 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
            >
              免费注册
            </Link>
          </div>
        )}

        {/* Tabs: 知识文档 / 数据报表 + 上传设置 */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("docs")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === "docs"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              知识文档
            </button>
            <button
              onClick={() => setActiveTab("data")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === "data"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              数据报表
            </button>
          </div>
          {canUpload && activeTab === "docs" && (
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                settingsOpen
                  ? "bg-indigo-100 text-indigo-700 shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${settingsOpen ? "rotate-90" : ""}`}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              {settingsOpen ? "收起设置" : "上传设置"}
            </button>
          )}
        </div>

        {activeTab === "data" ? (
          <div className="mt-5">
            <DataTablesSection spaceId={spaceId} canUpload={canUpload} />
          </div>
        ) : (
        <>

        {/* Upload Card */}
        {canUpload && (
          <div className="pt-5">
            {settingsOpen && (
              <div className="mb-4 overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-cyan-50/50 p-4 shadow-md shadow-indigo-100/50">
                <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                  <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[180px]">
                    <span className="text-xs font-medium text-indigo-700">解析方式</span>
                    <div className="relative">
                      <select
                        value={parseMode}
                        onChange={(e) => setParseMode(e.target.value as ParseModeOption)}
                        className="w-full appearance-none rounded-lg border border-indigo-200 bg-white py-2.5 pl-4 pr-10 text-sm text-slate-700 shadow-sm outline-none transition-all hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
                      >
                        {PARSE_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[240px]">
                    <span className="text-xs font-medium text-indigo-700">LlamaParse Tier</span>
                    <div className="relative">
                      <select
                        value={llamaParseTier}
                        onChange={(e) => setLlamaParseTier(e.target.value as LlamaParseTierOption)}
                        className="w-full appearance-none rounded-lg border border-indigo-200 bg-white py-2.5 pl-4 pr-10 text-sm text-slate-700 shadow-sm outline-none transition-all hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
                      >
                        {LLAMA_TIER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[180px]">
                    <span className="text-xs font-medium text-indigo-700">切分策略</span>
                    <div className="relative">
                      <select
                        value={chunkStrategy}
                        onChange={(e) => setChunkStrategy(e.target.value as ChunkStrategyOption)}
                        className="w-full appearance-none rounded-lg border border-indigo-200 bg-white py-2.5 pl-4 pr-10 text-sm text-slate-700 shadow-sm outline-none transition-all hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
                      >
                        {CHUNK_STRATEGY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </label>
                </div>
                {(chunkStrategy === "standard" || chunkStrategy === "parentChild" || chunkStrategy === "semantic") && (
                  <div className="mt-4 space-y-4 rounded-lg border border-indigo-100 bg-white/70 p-4">
                    <div>
                      <p className="mb-3 text-xs font-medium text-indigo-700">父块：400–1200 字，重叠 &lt; 父块 - 50</p>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-slate-600">父块大小</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={parentChunkSizeStr}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "");
                              setParentChunkSizeStr(v || "");
                            }}
                            onBlur={() => {
                              const n = parseInt(parentChunkSizeStr, 10);
                              if (isNaN(n) || parentChunkSizeStr === "") setParentChunkSizeStr("800");
                              else if (n < 400) setParentChunkSizeStr("400");
                              else if (n > 1200) setParentChunkSizeStr("1200");
                            }}
                            placeholder="800"
                            className="w-28 rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-slate-600">重叠区</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={parentOverlapStr}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "");
                              setParentOverlapStr(v || "");
                            }}
                            onBlur={() => {
                              const maxO = parseParentChunkSize() - 50;
                              const n = parseInt(parentOverlapStr, 10);
                              if (isNaN(n) || parentOverlapStr === "") setParentOverlapStr("100");
                              else if (n < 0) setParentOverlapStr("0");
                              else if (n > maxO) setParentOverlapStr(String(maxO));
                            }}
                            placeholder="100"
                            className="w-28 rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
                          />
                        </label>
                      </div>
                    </div>
                    {chunkStrategy === "parentChild" && (
                      <div className="border-t border-indigo-100 pt-4">
                        <p className="mb-3 text-xs font-medium text-indigo-700">子块：100–600 字，重叠 &lt; 子块 - 20</p>
                        <div className="flex flex-wrap gap-4">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs text-slate-600">子块大小</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={childChunkSizeStr}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "");
                                setChildChunkSizeStr(v || "");
                              }}
                              onBlur={() => {
                                const n = parseInt(childChunkSizeStr, 10);
                                if (isNaN(n) || childChunkSizeStr === "") setChildChunkSizeStr("300");
                                else if (n < 100) setChildChunkSizeStr("100");
                                else if (n > 600) setChildChunkSizeStr("600");
                              }}
                              placeholder="300"
                              className="w-28 rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs text-slate-600">重叠区</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={childOverlapStr}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "");
                                setChildOverlapStr(v || "");
                              }}
                              onBlur={() => {
                                const maxO = parseChildChunkSize() - 20;
                                const n = parseInt(childOverlapStr, 10);
                                if (isNaN(n) || childOverlapStr === "") setChildOverlapStr("50");
                                else if (n < 0) setChildOverlapStr("0");
                                else if (n > maxO) setChildOverlapStr(String(maxO));
                              }}
                              placeholder="50"
                              className="w-28 rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div
              className={`relative rounded-2xl border-2 border-dashed bg-white transition-all cursor-pointer ${
                dragOver
                  ? "border-indigo-400 bg-indigo-50 shadow-md"
                  : uploading
                  ? "border-indigo-300 bg-indigo-50/50"
                  : "border-slate-200 hover:border-indigo-300 hover:shadow-md"
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
              <div className="flex flex-col sm:flex-row items-center gap-4 py-6 px-6">
                {uploading ? (
                  <div className="flex-1 w-full">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-8 h-8 border-[3px] border-indigo-200 border-t-indigo-500 rounded-full animate-spin shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700">
                          {uploadProgress?.stage === "parsing"
                            ? uploadProgress.message || "正在解析文档..."
                            : uploadProgress?.stage === "chunking"
                            ? `切分完成，共 ${uploadProgress.total} 个片段`
                            : uploadProgress?.stage === "summarizing"
                            ? `生成摘要 ${uploadProgress.current}/${uploadProgress.total}`
                            : uploadProgress?.stage === "embedding"
                            ? `向量化中 ${uploadProgress.current}/${uploadProgress.total}`
                            : uploadProgress?.stage === "storing"
                            ? "正在写入数据库..."
                            : "正在处理..."}
                        </p>
                        {(uploadProgress?.stage === "summarizing" ||
                          uploadProgress?.stage === "embedding") &&
                          uploadProgress.total &&
                          uploadProgress.current != null && (
                            <div className="mt-2 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-indigo-500 to-cyan-500 h-2 rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.round(
                                    (uploadProgress.current / uploadProgress.total) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          )}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          abortRef.current?.abort();
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        取消上传
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
                    <svg
                      width="20"
                      height="20"
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
                {!uploading && (
                <div className="text-center sm:text-left">
                  <p className="text-sm font-medium text-slate-700">
                    拖拽文件到此处，或点击选择文件
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mt-2">
                    {Object.entries(FORMAT_META).map(([ext, meta]) => (
                      <span
                        key={ext}
                        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${meta.bg} ${meta.color}`}
                      >
                        .{ext}
                      </span>
                    ))}
                    <span className="text-[10px] text-slate-400">
                      最大 20MB
                    </span>
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* Upload message */}
            {uploadMsg && (
              <div
                className={`mt-3 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${
                  uploadMsg.includes("已导入")
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-600 border border-red-200"
                }`}
              >
                <span className="text-base">
                  {uploadMsg.includes("已导入") ? "✓" : "!"}
                </span>
                <span className="flex-1">{uploadMsg}</span>
                {!isLoggedIn && uploadMsg.includes("上限") && (
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
        )}

        {/* Search + Filter */}
        <div className="mt-5 mb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              width="15"
              height="15"
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
              className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-400"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {FORMAT_FILTERS.map((f) => {
              const count = formatCounts[f.value] ?? 0;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    filter === f.value
                      ? "bg-indigo-500 text-white shadow-sm"
                      : "bg-white border border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600"
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
          <div className="flex items-center justify-center py-20 text-slate-400">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <svg
                width="24"
                height="24"
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
              {filter === "all" && !search && canUpload
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
                  <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                    {canUpload && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteDoc(doc.title);
                        }}
                        className="text-[11px] text-red-400 hover:text-red-600 font-medium"
                      >
                        删除
                      </button>
                    )}
                    <span className="text-[11px] text-indigo-400 font-medium">
                      预览 →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>
        )}
      </div>

      {/* Delete Document Confirmation */}
      {confirmDeleteDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !deletingDoc && setConfirmDeleteDoc(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-800">确认删除文档</h3>
            <p className="text-sm text-slate-500 mt-2">
              删除后，该文档的所有片段将被永久清除，AI 将无法再检索此文档。此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setConfirmDeleteDoc(null)}
                disabled={deletingDoc}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteDoc(confirmDeleteDoc)}
                disabled={deletingDoc}
                className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {deletingDoc ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

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
            {/* Tab switcher */}
            <div className="px-6 pt-3 pb-0 flex gap-1 border-b border-slate-100">
              <button
                onClick={() => setPreviewMode("markdown")}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
                  previewMode === "markdown"
                    ? "bg-white text-indigo-600 border border-b-white border-slate-200 -mb-px"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Markdown 预览
              </button>
              <button
                onClick={() => setPreviewMode("chunks")}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
                  previewMode === "chunks"
                    ? "bg-white text-indigo-600 border border-b-white border-slate-200 -mb-px"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                分片视图
              </button>
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
              ) : previewMode === "markdown" ? (
                <div className="prose prose-sm prose-slate max-w-none prose-headings:text-slate-800 prose-table:text-xs prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:border-slate-200 prose-th:border-slate-200">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    allowedElements={MARKDOWN_ALLOWED_ELEMENTS}
                    unwrapDisallowed
                    components={MARKDOWN_COMPONENTS}
                  >
                    {normalizeMarkdownHighlights(chunks.map((c) => c.content).join("\n\n"))}
                  </ReactMarkdown>
                </div>
              ) : (
                <ChunkTreeView chunks={chunks} format={preview.format} />
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
    </>
  );
}

const DEMO_SPACE_ID = "00000000-0000-0000-0000-000000000001";

/* ─── Main Page ─── */
export default function KnowledgePage() {
  const { user, loading: authLoading, refresh } = useAuth();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);

  // Build space cards from user.spaces
  const spaceCards: SpaceCard[] = useMemo(() => {
    const demoSpace: SpaceCard = {
      spaceId: DEMO_SPACE_ID,
      spaceName: "预置文档",
      role: "viewer" as const,
    };

    // Unregistered user: preset docs space, read-only
    if (!user) {
      return [demoSpace];
    }

    const userSpaces = user.spaces.map((s) => ({
      spaceId: s.spaceId,
      spaceName: s.spaceName,
      role: s.role,
      isDefault: s.isDefault,
    }));

    // Always include demo space if user doesn't already belong to it
    const hasDemoSpace = userSpaces.some((s) => s.spaceId === DEMO_SPACE_ID);
    return hasDemoSpace ? userSpaces : [demoSpace, ...userSpaces];
  }, [user]);

  const selectedSpace = useMemo(() => {
    if (!selectedSpaceId) return null;
    return spaceCards.find((s) => s.spaceId === selectedSpaceId) ?? null;
  }, [selectedSpaceId, spaceCards]);

  // Determine if current user is admin (tenant admin)
  const isAdmin = user?.tenantRole === "admin";

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Nav />
        <div className="flex items-center justify-center py-32 text-slate-400">
          <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />

      {selectedSpaceId && selectedSpace ? (
        /* Level 2: Space Documents */
        <SpaceDocuments
          spaceId={selectedSpaceId}
          spaceName={selectedSpace.spaceName}
          spaceRole={selectedSpace.role}
          spaces={spaceCards}
          onBack={() => setSelectedSpaceId(null)}
          onSwitch={setSelectedSpaceId}
          isAdmin={isAdmin}
          isDefault={!!selectedSpace.isDefault}
          isLoggedIn={!!user}
        />
      ) : (
        /* Level 1: Space List */
        <SpaceList
          spaces={spaceCards}
          onSelect={setSelectedSpaceId}
          user={{
            tenantId: user?.tenantId ?? "",
            tenantRole: user?.tenantRole ?? null,
          }}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
