"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type ReviewItem = {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  review_status: "pending" | "approved" | "rejected";
  review_note: string | null;
  updated_at: string;
  created_at: string;
  author_name: string;
};

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

export default function AdminGamesReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  async function load() {
    setFetching(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/spark/reviews");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "加载失败");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setMessage("加载失败，请稍后重试");
      setItems([]);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const pendingItems = useMemo(
    () => items.filter((item) => item.review_status === "pending"),
    [items]
  );
  const historyItems = useMemo(
    () => items.filter((item) => item.review_status !== "pending"),
    [items]
  );

  function review(item: ReviewItem, action: "approve" | "reject") {
    if (pending || actionId) return;
    setActionId(item.id);
    startTransition(async () => {
      setMessage(null);
      try {
        const res = await fetch("/api/admin/spark/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            action,
            note: noteMap[item.id]?.trim() || undefined,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setMessage(data?.error || "审核失败");
          return;
        }
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  review_status: data.item?.review_status || it.review_status,
                  review_note:
                    typeof data.item?.review_note === "string"
                      ? data.item.review_note
                      : null,
                }
              : it
          )
        );
      } catch {
        setMessage("审核失败，请稍后再试");
      } finally {
        setActionId(null);
      }
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm uppercase tracking-[0.26em] text-cyan-300/80">
              Admin Review
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">游戏发布审核</h1>
            <p className="mt-3 text-sm text-slate-400">
              只有审核通过且公开的游戏，才会展示在 /games 页面。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
          >
            刷新
          </button>
        </div>

        {message ? (
          <div className="mb-5 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {message}
          </div>
        ) : null}

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-white">
            待审核 ({pendingItems.length})
          </h2>
          {fetching ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
              加载中...
            </div>
          ) : pendingItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
              暂无待审核游戏。
            </div>
          ) : (
            <div className="space-y-4">
              {pendingItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
                >
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-cyan-300/70">
                        {item.slug}
                      </div>
                      <h3 className="mt-1 text-xl font-semibold">{item.title}</h3>
                      <div className="mt-2 text-xs text-slate-500">
                        作者：{item.author_name} · 更新时间：{formatTime(item.updated_at)}
                      </div>
                    </div>
                    <a
                      href={`/admin/games/${item.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-cyan-400/40 px-3 py-1.5 text-xs text-cyan-200 transition hover:border-cyan-300"
                    >
                      预览
                    </a>
                  </div>
                  <p className="mb-3 text-sm text-slate-300">
                    {item.description || "暂无描述"}
                  </p>
                  <textarea
                    value={noteMap[item.id] ?? ""}
                    onChange={(e) =>
                      setNoteMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    rows={3}
                    placeholder="审核备注（可选）"
                    className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => review(item, "approve")}
                      disabled={pending || actionId === item.id}
                      className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      onClick={() => review(item, "reject")}
                      disabled={pending || actionId === item.id}
                      className="rounded-full border border-rose-400/50 px-4 py-2 text-sm text-rose-200 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-400"
                    >
                      拒绝
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            已处理 ({historyItems.length})
          </h2>
          <div className="space-y-3">
            {historyItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-slate-100">{item.title}</span>
                    <span className="ml-2 text-slate-500">({item.slug})</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      item.review_status === "approved"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-rose-500/20 text-rose-200"
                    }`}
                  >
                    {item.review_status === "approved" ? "已通过" : "已拒绝"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  作者：{item.author_name} · {formatTime(item.updated_at)}
                </div>
                {item.review_note ? (
                  <div className="mt-2 rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-400">
                    备注：{item.review_note}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
