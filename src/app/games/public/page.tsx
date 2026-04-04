import Link from "next/link";
import { PublicGamesView } from "@/components/games/public-games-view";
import { getPublicGames } from "@/lib/spark/public-games";

export default async function PublicGamesPage() {
  const games = await getPublicGames();

  return (
    <div className="h-[100dvh] overflow-hidden bg-[radial-gradient(1000px_480px_at_-10%_-10%,rgba(14,165,233,0.16),transparent_60%),radial-gradient(900px_460px_at_110%_-10%,rgba(236,72,153,0.15),transparent_58%),linear-gradient(180deg,#0c1426,#0b1322_45%,#0a1020)] text-slate-100">
      <div className="mx-auto flex h-full max-w-7xl flex-col px-6 pt-6 pb-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-fuchsia-200/75">Game Plaza</div>
            <div className="text-xl font-semibold tracking-tight text-white">游戏广场</div>
          </div>
          <div className="flex items-center gap-2">
          <Link
            href="/games"
            className="rounded-full border border-fuchsia-300/35 bg-fuchsia-300/10 px-4 py-2 text-sm text-fuchsia-100 transition hover:border-fuchsia-200 hover:bg-fuchsia-300/15"
          >
            我的创作
          </Link>
          <Link
            href="/"
            className="rounded-full border border-slate-600/70 bg-slate-800/45 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/60 hover:text-cyan-100"
          >
            返回首页
          </Link>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <PublicGamesView games={games} />
        </div>
      </div>
    </div>
  );
}
