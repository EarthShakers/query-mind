import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/auth";
import { GameStudio } from "@/components/games/game-studio";
import { supabaseAdmin } from "@/lib/supabase";

export default async function GameStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!supabaseAdmin) notFound();

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, user_id, slug, title, updated_at, files")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  if (String(data.user_id) !== user.userId) notFound();

  const files = (data.files as Record<string, string> | null) ?? {};
  const entries = Object.keys(files).sort((a, b) => a.localeCompare(b));
  if (entries.length === 0) {
    entries.push("index.html");
    files["index.html"] = "";
  }

  return (
    <GameStudio
      gameId={String(data.id)}
      initialData={{
        id: String(data.id),
        slug: String(data.slug),
        title: String((data as { title?: string | null }).title || data.slug),
        updated_at: String(data.updated_at),
        files,
        entries,
      }}
    />
  );
}
