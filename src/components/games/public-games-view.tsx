"use client";

import { useMemo, useState } from "react";
import { GamesGallery } from "@/components/games/games-gallery";
import type { SparkPublicGame } from "@/lib/spark/public-games";

export function PublicGamesView({ games }: { games: SparkPublicGame[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("全部");
  const [sortBy, setSortBy] = useState<"recommended" | "latest">("recommended");

  const guessCategory = (g: SparkPublicGame): string => {
    const t = `${g.title || ""} ${g.slug || ""} ${(g.description || "")}`.toLowerCase();
    if (/(tank|shooter|battle|war|战|射击|坦克)/.test(t)) return "动作";
    if (/(bird|snake|mario|runner|jump|platform|跑|跳)/.test(t)) return "闯关";
    if (/(card|memory|puzzle|2048|sudoku|gobang|chess|棋|记忆|拼图)/.test(t)) return "益智";
    if (/(racing|car|drift|赛车|驾驶)/.test(t)) return "竞速";
    return "休闲";
  };

  const categories = useMemo(() => {
    const set = new Set<string>(["全部"]);
    for (const g of games) set.add(guessCategory(g));
    return Array.from(set);
  }, [games]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = games.filter((g) => {
      if (category !== "全部" && guessCategory(g) !== category) return false;
      if (!q) return true;
      const title = (g.title || "").toLowerCase();
      const slug = (g.slug || "").toLowerCase();
      const desc = (g.description || "").toLowerCase();
      const author = (g.author_name || "").toLowerCase();
      return (
        title.includes(q) ||
        slug.includes(q) ||
        desc.includes(q) ||
        author.includes(q)
      );
    });
    if (sortBy === "latest") {
      return base.slice().sort((a, b) => {
        const ta = Number(new Date(a.updated_at || 0));
        const tb = Number(new Date(b.updated_at || 0));
        return tb - ta;
      });
    }
    return base
      .map((g) => {
        const ts = Number(new Date(g.updated_at || 0));
        const recency = Number.isFinite(ts) ? ts / 1e10 : 0;
        const cover = g.cover_url ? 1 : 0;
        const descScore = Math.min((g.description || "").length / 120, 1);
        const score = recency + cover * 0.8 + descScore * 0.3;
        return { g, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.g);
  }, [games, query, category, sortBy]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl bg-slate-900/35 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <div className="sticky top-0 z-10 bg-[linear-gradient(135deg,rgba(244,114,182,0.2),rgba(251,146,60,0.12)_45%,rgba(14,165,233,0.14))] px-5 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    category === c
                      ? "bg-cyan-300/30 text-cyan-50 ring-1 ring-cyan-200/40"
                      : "bg-slate-900/35 text-slate-100 hover:bg-slate-900/50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex w-full max-w-[420px] shrink-0 items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索游戏（标题 / slug / 作者）"
              className="w-full rounded-full border border-white/30 bg-slate-950/60 px-4 py-2 text-sm text-slate-50 outline-none transition placeholder:text-slate-300/70 focus:border-cyan-200/70"
            />
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "recommended" | "latest")}
                className="appearance-none rounded-full border border-white/30 bg-slate-950/60 pl-3 pr-8 py-2 text-xs text-slate-100 outline-none"
              >
                <option value="recommended">推荐</option>
                <option value="latest">最新</option>
              </select>
              <svg
                viewBox="0 0 20 20"
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="m5 7 5 6 5-6" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pt-4 pb-24 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <GamesGallery
          games={filtered}
          currentUserId={null}
          editable={false}
          layout="grid"
          emptyText={query.trim() ? "没有找到匹配的游戏，试试别的关键词。" : undefined}
        />
      </div>
    </div>
  );
}
