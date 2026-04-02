import Link from "next/link";
import { getSessionUser } from "@/lib/auth/auth";
import { GamesGallery } from "@/components/games/games-gallery";
import { getPublicGames } from "@/lib/spark/public-games";

export default async function GamesPage() {
  const [games, user] = await Promise.all([getPublicGames(), getSessionUser()]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm uppercase tracking-[0.28em] text-cyan-300/80">
              Spark Games
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              在线游戏广场
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              这里展示已经同步到 Supabase 的公开游戏快照。点击任意卡片即可在线试玩；如果是你自己发布的游戏，还可以直接补充封面和描述。
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
          >
            返回首页
          </Link>
        </div>

        <GamesGallery games={games} currentUserId={user?.userId ?? null} />
      </div>
    </div>
  );
}
