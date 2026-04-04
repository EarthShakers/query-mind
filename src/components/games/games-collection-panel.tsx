"use client";

import { useMemo, useState } from "react";
import { GamesGallery } from "@/components/games/games-gallery";
import type { SparkPublicGame } from "@/lib/spark/public-games";

export function GamesCollectionPanel({
  games,
  currentUserId,
  editable,
  showAuthor,
  layout,
  searchPlaceholder,
}: {
  games: SparkPublicGame[];
  currentUserId: string | null;
  editable?: boolean;
  showAuthor?: boolean;
  layout?: "grid" | "list";
  searchPlaceholder: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => {
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
  }, [games, query]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl bg-slate-900/45">
      <div className="sticky top-0 z-10 bg-slate-900/90 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-full border border-slate-600 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
          />
          <span className="shrink-0 text-xs text-slate-400">
            {filtered.length} / {games.length}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pt-4 pb-24 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <GamesGallery
          games={filtered}
          currentUserId={currentUserId}
          editable={editable}
          showAuthor={showAuthor}
          layout={layout}
          emptyText={query.trim() ? "没有找到匹配的游戏，试试别的关键词。" : undefined}
        />
      </div>
    </div>
  );
}
