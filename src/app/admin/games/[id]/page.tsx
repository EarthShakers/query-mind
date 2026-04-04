import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/auth";
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

export default async function AdminGameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user || (user.role !== "superAdmin" && user.tenantRole !== "admin")) {
    notFound();
  }
  if (!supabaseAdmin) {
    notFound();
  }

  const { id } = await params;
  const { data } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, slug, title, description, updated_at, review_status")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">
              {String(data.slug)}
            </div>
            <h1 className="mt-2 text-3xl font-semibold">
              {String(data.title || data.slug)}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              {typeof data.description === "string" && data.description
                ? data.description
                : "暂无描述"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/games"
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
            >
              返回审核页
            </Link>
            <a
              href={`/api/admin/spark/public/${String(data.id)}/index.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
            >
              新窗口打开
            </a>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>状态：{String(data.review_status || "pending")}</span>
          <span>快照 ID：{String(data.id)}</span>
          <span>最近更新：{formatTime(String(data.updated_at))}</span>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-[0_30px_120px_rgba(15,23,42,0.45)]">
          <iframe
            title={String(data.title || data.slug)}
            src={`/api/admin/spark/public/${String(data.id)}/index.html`}
            className="h-[78vh] w-full bg-slate-950"
          />
        </div>
      </div>
    </div>
  );
}

