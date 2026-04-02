"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { SparkPublicGame } from "@/lib/spark/public-games";

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function GameCard({
  game,
  isOwner,
}: {
  game: SparkPublicGame;
  isOwner: boolean;
}) {
  const [description, setDescription] = useState(game.description || "");
  const [coverUrl, setCoverUrl] = useState(game.cover_url || "");
  const [savedDescription, setSavedDescription] = useState(game.description || "");
  const [savedCoverUrl, setSavedCoverUrl] = useState(game.cover_url || "");
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <>
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5 transition hover:border-cyan-400/60 hover:shadow-[0_20px_80px_rgba(34,211,238,0.12)]">
        <Link href={`/games/${game.id}`} className="group block">
          <div className="mb-5 aspect-[16/10] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            {savedCoverUrl ? (
              <img
                src={savedCoverUrl}
                alt={`${game.title} cover`}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex h-full items-end bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.22),_transparent_40%),linear-gradient(180deg,_rgba(15,23,42,0.6),_rgba(2,6,23,0.95))] p-4">
                <div className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100/80">
                  Spark Game
                </div>
              </div>
            )}
          </div>
        </Link>

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">
              {game.slug}
            </div>
            <Link href={`/games/${game.id}`} className="mt-1 block text-xl font-semibold text-white hover:text-cyan-200">
              {game.title}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {isOwner ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-cyan-400 hover:text-cyan-200"
                aria-label="编辑游戏"
                title="编辑游戏"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
                  <path d="M4 20h4l10-10a2.12 2.12 0 0 0-3-3L5 17l-1 3Z" />
                  <path d="m13.5 6.5 4 4" />
                </svg>
              </button>
            ) : null}
            <Link
              href={`/games/${game.id}`}
              className="rounded-full border border-cyan-400/40 px-3 py-1 text-xs text-cyan-200 transition hover:border-cyan-300 hover:text-cyan-100"
            >
              点击即玩
            </Link>
          </div>
        </div>

        <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">
          {savedDescription || "这是一款通过 spark CLI 生成并发布到线上展示的 HTML5 游戏。"}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>作者：{game.author_name}</span>
          <span>最近更新：{formatTime(game.updated_at)}</span>
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
    </>
  );
}

export function GamesGallery({
  games,
  currentUserId,
}: {
  games: SparkPublicGame[];
  currentUserId: string | null;
}) {
  if (games.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-sm text-slate-400">
        还没有可公开展示的游戏。先用{" "}
        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">
          spark push -g your-game
        </code>{" "}
        把本地游戏同步到 Supabase。
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          isOwner={Boolean(currentUserId && currentUserId === game.user_id)}
        />
      ))}
    </div>
  );
}
