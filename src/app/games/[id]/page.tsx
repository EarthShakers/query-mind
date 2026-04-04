import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/auth";
import { getPublicGameById } from "@/lib/spark/public-games";
import { supabaseAdmin } from "@/lib/supabase";

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

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  let game = await getPublicGameById(id);
  let isOwnerPrivateView = false;

  if (!game && user && supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("spark_snapshots")
      .select(
        "id, user_id, slug, title, description, cover_url, updated_at, created_at, review_status"
      )
      .eq("id", id)
      .eq("user_id", user.userId)
      .maybeSingle();
    if (data) {
      game = {
        id: String(data.id),
        user_id: String(data.user_id),
        slug: String(data.slug),
        title: String(
          (data as { title?: string | null }).title || String(data.slug)
        ),
        description:
          typeof (data as { description?: string | null }).description === "string"
            ? (data as { description?: string | null }).description ?? null
            : null,
        cover_url:
          typeof (data as { cover_url?: string | null }).cover_url === "string"
            ? (data as { cover_url?: string | null }).cover_url ?? null
            : null,
        author_name: user.displayName || user.email.split("@")[0] || "我",
        updated_at: String(data.updated_at),
        created_at: typeof data.created_at === "string" ? data.created_at : undefined,
        review_status:
          data.review_status === "pending" ||
          data.review_status === "approved" ||
          data.review_status === "rejected"
            ? data.review_status
            : "pending",
      };
      isOwnerPrivateView = true;
    }
  }

  if (!game) notFound();
  const playBase = isOwnerPrivateView
    ? `/api/spark/private/${game.id}`
    : `/api/spark/public/${game.id}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">
              {game.slug}
            </div>
            <h1 className="mt-2 text-3xl font-semibold">{game.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              {game.description || "进入游戏，马上开始挑战。"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/games"
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
            >
              返回游戏列表
            </Link>
            <a
              href={`${playBase}/index.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
            >
              新窗口打开
            </a>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>作者：{game.author_name}</span>
          <span>最近更新：{formatTime(game.updated_at)}</span>
          {isOwnerPrivateView ? (
            <span>审核状态：{game.review_status || "pending"}</span>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-[0_30px_120px_rgba(15,23,42,0.45)]">
          <iframe
            title={game.title}
            src={`${playBase}/index.html`}
            className="h-[78vh] w-full bg-slate-950"
          />
        </div>
      </div>
    </div>
  );
}
