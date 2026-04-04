"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { SparkPublicGame } from "@/lib/spark/public-games";

function resolveToastTone(message: string): "success" | "warning" | "error" | "info" {
  if (/已下架/.test(message)) return "info";
  if (/请勿重复发布|审核中|无需重复|重复/.test(message)) return "warning";
  if (/失败|错误|无权|不能|请先|不存在|禁止|非法/.test(message)) return "error";
  if (/已|成功|完成|通过|上架|下架|提交/.test(message)) return "success";
  return "info";
}

function GameCard({
  game,
  isOwner,
  onDeleted,
  showAuthor,
}: {
  game: SparkPublicGame;
  isOwner: boolean;
  onDeleted: (id: string) => void;
  showAuthor: boolean;
}) {
  const [description, setDescription] = useState(game.description || "");
  const [coverUrl, setCoverUrl] = useState(game.cover_url || "");
  const [savedDescription, setSavedDescription] = useState(game.description || "");
  const [savedCoverUrl, setSavedCoverUrl] = useState(game.cover_url || "");
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublic, setIsPublic] = useState(game.is_public !== false);
  const [reviewStatus, setReviewStatus] = useState<
    "pending" | "approved" | "rejected"
  >(
    game.review_status === "approved" || game.review_status === "rejected"
      ? game.review_status
      : "pending"
  );
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const viewHref = isOwner ? `/games/${game.id}/studio` : `/games/${game.id}`;
  const playHref = isOwner
    ? `/api/spark/private/${game.id}/index.html`
    : `/api/spark/public/${game.id}/index.html`;

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 2200);
    return () => window.clearTimeout(t);
  }, [message]);

  const hasChanges =
    description.trim() !== (savedDescription || "").trim() ||
    coverUrl.trim() !== (savedCoverUrl || "").trim();

  function save() {
    if (!isOwner || isPending || !hasChanges) return;

    startTransition(async () => {
      setMessage(null);
      try {
        const res = await fetch(`/api/spark/games/${game.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: description.trim() || null,
            coverUrl: coverUrl.trim() || null,
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setMessage(data?.error || "保存失败");
          return;
        }

        setSavedDescription(data.game?.description || "");
        setSavedCoverUrl(data.game?.coverUrl || "");
        setDescription(data.game?.description || "");
        setCoverUrl(data.game?.coverUrl || "");
        setMessage("已保存");
        setIsEditing(false);
      } catch {
        setMessage("保存失败，请稍后再试");
      }
    });
  }

  async function uploadCover(file: File) {
    if (!isOwner) return;
    setMessage(null);
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/spark/games/${game.id}/cover`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "上传失败");
        return;
      }
      setSavedCoverUrl(data.game?.coverUrl || "");
      setCoverUrl(data.game?.coverUrl || "");
      setMessage("封面已更新");
    } catch {
      setMessage("上传失败，请稍后再试");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeGame() {
    if (!isOwner || isDeleting) return;
    const ok = window.confirm("确认删除这个游戏吗？删除后不可恢复。");
    if (!ok) return;
    setMessage(null);
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/spark/games/${game.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "删除失败");
        return;
      }
      onDeleted(game.id);
    } catch {
      setMessage("删除失败，请稍后再试");
    } finally {
      setIsDeleting(false);
    }
  }

  async function togglePublic() {
    if (!isOwner || isTogglingPublic) return;
    setMessage(null);
    setIsTogglingPublic(true);
    try {
      const next = !isPublic;
      if (next) {
        if (reviewStatus !== "approved") {
          setMessage("请先发布并通过审核，再上架");
          return;
        }
        const checkRes = await fetch(`/api/spark/editor/${game.id}`, {
          cache: "no-store",
        });
        const checkData = await checkRes.json().catch(() => null);
        if (!checkRes.ok) {
          setMessage(checkData?.error || "发布检查失败");
          return;
        }
        const html = (checkData?.files?.["index.html"] || "").trim();
        if (!html) {
          setMessage("请先在创作台完善 index.html 后再发布");
          return;
        }
      }
      const res = await fetch(`/api/spark/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "操作失败");
        return;
      }
      setIsPublic(Boolean(data?.game?.isPublic ?? next));
      if (data?.game?.reviewStatus) {
        setReviewStatus(data.game.reviewStatus);
      }
      setMessage(next ? "已上架" : "已下架");
    } catch {
      setMessage("操作失败，请稍后再试");
    } finally {
      setIsTogglingPublic(false);
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 p-5 transition hover:shadow-[0_20px_80px_rgba(34,211,238,0.12)]">
        <div className="group relative mb-5 aspect-[16/10] overflow-hidden rounded-2xl bg-slate-900">
          <Link href={viewHref} className="block h-full w-full">
            {savedCoverUrl ? (
              <img
                src={savedCoverUrl}
                alt={`${game.title} cover`}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex h-full items-end bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.22),_transparent_40%),linear-gradient(180deg,_rgba(15,23,42,0.6),_rgba(2,6,23,0.95))] p-4">
                <div className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100/80">
                  Featured
                </div>
              </div>
            )}
          </Link>
          <Link
            href={playHref}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35 bg-slate-950/45 px-3 py-1 text-xs text-white backdrop-blur-sm transition md:opacity-0 md:group-hover:opacity-100 hover:bg-slate-950/60"
          >
            立即试玩
          </Link>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={viewHref}
                className="block truncate text-xl font-semibold text-white hover:text-cyan-200"
                title={game.title}
              >
                {game.title}
              </Link>
              <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[11px] text-cyan-200">
                {game.slug}
              </span>
            </div>
          </div>
          {isOwner ? (
            <button
              type="button"
              onClick={() => void togglePublic()}
              disabled={isTogglingPublic}
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                isPublic
                  ? "border-emerald-400/55 bg-emerald-500/10"
                  : "border-slate-500/60 bg-slate-700/25"
              } disabled:cursor-not-allowed`}
              title={isPublic ? "已上架" : "已下架"}
              aria-label={isPublic ? "已上架" : "已下架"}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isPublic ? "bg-emerald-300" : "bg-slate-400"
                }`}
              />
            </button>
          ) : (
            <div />
          )}
        </div>

        <p className="mt-2 h-12 overflow-hidden text-sm leading-6 text-slate-400">
          {savedDescription || "一款轻量好玩的网页小游戏，点击即可开始。"}
        </p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 text-xs text-slate-500">
          <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
            {showAuthor ? (
              <span className="whitespace-nowrap">作者：{game.author_name}</span>
            ) : null}
          </div>
          {isOwner ? (
            <div className="grid shrink-0 grid-cols-[2rem_4.5rem_2rem] items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-cyan-400 hover:text-cyan-200"
                aria-label="编辑游戏"
                title="编辑"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
                  <path d="M4 20h4l10-10a2.12 2.12 0 0 0-3-3L5 17l-1 3Z" />
                  <path d="m13.5 6.5 4 4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  router.push(`/games/${game.id}/studio`);
                }}
                className="inline-flex h-8 w-[4.5rem] items-center justify-center rounded-full border border-cyan-400/45 px-0 text-xs text-cyan-200 transition hover:border-cyan-300 hover:text-cyan-100"
                aria-label="更新游戏"
                title="更新"
              >
                更新
              </button>
              <button
                type="button"
                onClick={() => void removeGame()}
                disabled={isDeleting}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/40 text-rose-200 transition hover:border-rose-300 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                aria-label="删除游戏"
                title="删除"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {isOwner && isEditing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-800 bg-slate-900 p-5 shadow-[0_30px_120px_rgba(2,6,23,0.8)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">
                  编辑游戏
                </div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {game.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDescription(savedDescription || "");
                  setCoverUrl(savedCoverUrl || "");
                  setMessage(null);
                  setIsEditing(false);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white"
                aria-label="关闭"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
                  <path d="M6 6 18 18" />
                  <path d="M18 6 6 18" />
                </svg>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCover(file);
              }}
            />

            <div className="mb-4 grid gap-4 md:grid-cols-[132px_1fr]">
              <div className="h-32 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                {savedCoverUrl ? (
                  <img src={savedCoverUrl} alt={`${game.title} cover preview`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    暂无封面
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="rounded-full border border-cyan-400/40 px-3 py-1.5 text-xs text-cyan-200 transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                  >
                    {isUploading ? "上传中..." : "上传封面"}
                  </button>
                  <span className="text-xs text-slate-500">支持 png / jpg / webp / gif / svg</span>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">封面图片 URL</span>
                  <input
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="也可以直接粘贴图片链接"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                  />
                </label>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">游戏描述</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="补充一句更吸引人的简介..."
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              />
            </label>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {message || "这部分只有当前登录发布者可编辑。"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDescription(savedDescription || "");
                    setCoverUrl(savedCoverUrl || "");
                    setMessage(null);
                    setIsEditing(false);
                  }}
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!hasChanges || isPending}
                  className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {isPending ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {message ? (
        (() => {
          const tone = resolveToastTone(message);
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
              className={`pointer-events-none fixed left-1/2 top-20 z-[70] -translate-x-1/2 rounded-full border px-5 py-2 text-sm font-semibold ${toneClass}`}
            >
              {message}
            </div>
          );
        })()
      ) : null}
    </>
  );
}

export function GamesGallery({
  games,
  currentUserId,
  editable = true,
  showAuthor = true,
  layout = "grid",
  emptyText,
}: {
  games: SparkPublicGame[];
  currentUserId: string | null;
  editable?: boolean;
  showAuthor?: boolean;
  layout?: "grid" | "list";
  emptyText?: string;
}) {
  const [localGames, setLocalGames] = useState(games);

  useEffect(() => {
    setLocalGames(games);
  }, [games]);

  if (localGames.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-sm text-slate-400">
        {emptyText || "还没有可展示的游戏，先去创作你的第一款作品吧。"}
      </div>
    );
  }

  return (
    <div
      className={
        layout === "list"
          ? "grid gap-4 grid-cols-1"
          : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      }
    >
      {localGames.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          isOwner={editable && Boolean(currentUserId && currentUserId === game.user_id)}
          showAuthor={showAuthor}
          onDeleted={(id) =>
            setLocalGames((prev) => prev.filter((item) => item.id !== id))
          }
        />
      ))}
    </div>
  );
}
