"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { normalizeSparkSlug } from "@/lib/spark/slug";

function buildTitleFromSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function CreateGameButton() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const normalizedSlug = useMemo(() => normalizeSparkSlug(slugInput), [slugInput]);
  const canSubmit = normalizedSlug.length > 0 && !isPending;

  useEffect(() => {
    setMounted(true);
  }, []);

  function reset() {
    setSlugInput("");
    setTitle("");
    setMessage(null);
  }

  function createGame() {
    if (!canSubmit) return;
    startTransition(async () => {
      setMessage(null);
      try {
        const res = await fetch("/api/spark/games/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: normalizedSlug,
            title: title.trim() || buildTitleFromSlug(normalizedSlug),
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setMessage(data?.error || "创建失败，请稍后再试");
          return;
        }
        const id = data?.game?.id;
        if (!id) {
          setMessage("创建成功，但未拿到游戏 ID");
          return;
        }
        reset();
        setOpen(false);
        router.push(`/games/${id}/studio`);
        router.refresh();
      } catch {
        setMessage("创建失败，请稍后再试");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
      >
        新建游戏
      </button>

      {open && mounted
        ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-slate-800 bg-slate-900 p-5 shadow-[0_30px_120px_rgba(2,6,23,0.8)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">创建新游戏</h3>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white"
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Slug</span>
              <input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder="例如: tank-battle"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              />
            </label>
            <div className="mt-1 text-xs text-slate-500">
              预览：{normalizedSlug || "请输入 slug"}
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs text-slate-400">标题（可选）</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={normalizedSlug ? buildTitleFromSlug(normalizedSlug) : "Game Title"}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              />
            </label>

            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="text-xs text-rose-300">{message || ""}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={createGame}
                  disabled={!canSubmit}
                  className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {isPending ? "创建中..." : "创建"}
                </button>
              </div>
            </div>
          </div>
        </div>
          ,
          document.body
        )
        : null}
    </>
  );
}
