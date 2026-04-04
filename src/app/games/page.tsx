import Link from "next/link";
import { getSessionUser } from "@/lib/auth/auth";
import { CreateGameButton } from "@/components/games/create-game-button";
import { GamesCollectionPanel } from "@/components/games/games-collection-panel";
import { getUserGames } from "@/lib/spark/public-games";

export default async function GamesPage() {
  const user = await getSessionUser();
  const games = user ? await getUserGames(user.userId) : [];
  const liveCount = games.filter((g) => g.is_public !== false).length;
  const hiddenCount = games.filter((g) => g.is_public === false).length;

  return (
    <div className="h-[100dvh] overflow-hidden bg-[radial-gradient(1200px_600px_at_10%_-10%,rgba(34,211,238,0.14),transparent_55%),radial-gradient(900px_500px_at_100%_0%,rgba(16,185,129,0.12),transparent_58%),linear-gradient(180deg,#020617,#0b1220_55%,#0a0f1a)] text-slate-100">
      <div className="mx-auto flex h-full max-w-7xl flex-col px-6 pt-6 pb-4">
        <div className="mb-6 flex items-center justify-end gap-2">
          <Link
            href="/games/public"
            className="rounded-full border border-emerald-500/40 px-4 py-2 text-sm text-emerald-200 transition hover:border-emerald-300 hover:text-emerald-100"
          >
            去逛广场
          </Link>
          <Link
            href="/"
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
          >
            返回首页
          </Link>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:h-fit">
            <div className="rounded-3xl border border-emerald-400/20 bg-slate-900/60 p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-300/80">
                My Studio
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                我的游戏
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300/85">
                维护你的作品状态，随时上架、下架或继续打磨。
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
                  <div className="text-xs text-emerald-200/85">已上架</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-100">{liveCount}</div>
                </div>
                <div className="rounded-2xl border border-slate-600/70 bg-slate-800/50 px-3 py-2">
                  <div className="text-xs text-slate-300/85">已下架</div>
                  <div className="mt-1 text-xl font-semibold text-slate-100">{hiddenCount}</div>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-slate-700/70 bg-slate-900/55 p-3">
                <div className="text-xs font-medium text-slate-200">创作与发布</div>
                {user ? <div className="mt-3"><CreateGameButton /></div> : null}
                <div className="mt-3 space-y-1 text-xs leading-5 text-slate-300/90">
                  <p>在卡片里点击编辑可改封面/描述，点击上架即可进入审核流程。</p>
                  <p>审核通过后会自动出现在游戏广场。</p>
                </div>
              </div>
            </div>
          </aside>

          <section className="min-h-0">
            <div className="mb-4 rounded-3xl border border-slate-700/70 bg-slate-900/45 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-100">作品列表</h2>
              <p className="mt-1 text-sm text-slate-400">
                点击封面中心可直接试玩，底部可快速编辑与上下架。发布后通过审核会出现在游戏广场。
              </p>
            </div>
            {user ? (
              <GamesCollectionPanel
                games={games}
                currentUserId={user.userId}
                editable
                showAuthor={false}
                layout="grid"
                searchPlaceholder="搜索我的游戏（标题 / slug / 描述）"
              />
            ) : (
              <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-8 text-sm text-slate-300">
                登录后即可管理你的作品。你也可以先去{" "}
                <Link className="text-emerald-300 hover:text-emerald-200" href="/games/public">
                  游戏广场
                </Link>{" "}
                看看大家在玩什么。
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
