import {
  getContentTypeForPath,
  getPublicGameById,
  getSnapshotFile,
} from "@/lib/spark/public-games";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; path?: string[] }> }
) {
  const params = await context.params;
  const game = await getPublicGameById(params.id);
  if (!game || !game.files) {
    return new Response("Not found", { status: 404 });
  }

  const relPath =
    params.path && params.path.length > 0
      ? params.path.join("/")
      : "index.html";

  const file = getSnapshotFile(game.files, relPath);
  if (file == null) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file, {
    status: 200,
    headers: {
      "Content-Type": getContentTypeForPath(relPath),
      "Cache-Control": "public, max-age=60",
    },
  });
}
