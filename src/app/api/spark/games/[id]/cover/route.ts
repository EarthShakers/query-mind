import { randomUUID } from "crypto";
import { getSessionUser } from "@/lib/auth/auth";
import { supabaseAdmin } from "@/lib/supabase";

const COVER_BUCKET = "spark-game-covers";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

function extFromType(type: string): string {
  switch (type) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

async function ensureBucket() {
  if (!supabaseAdmin) return;
  const { data } = await supabaseAdmin.storage.listBuckets();
  const exists = data?.some((bucket) => bucket.name === COVER_BUCKET);
  if (exists) return;
  await supabaseAdmin.storage.createBucket(COVER_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_FILE_SIZE}`,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return Response.json(
      { error: "服务器未配置 SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  const { id } = await params;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, user_id, slug")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "游戏不存在" }, { status: 404 });
  }
  if (existing.user_id !== user.userId) {
    return Response.json({ error: "无权修改该游戏" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "请选择图片文件" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: "仅支持 png/jpg/webp/gif/svg" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "图片不能超过 5MB" }, { status: 400 });
  }

  await ensureBucket();

  const bytes = Buffer.from(await file.arrayBuffer());
  const objectPath = `${user.userId}/${existing.slug}/${Date.now()}-${randomUUID()}.${extFromType(file.type)}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(COVER_BUCKET)
    .upload(objectPath, bytes, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(COVER_BUCKET)
    .getPublicUrl(objectPath);

  const coverUrl = publicUrlData.publicUrl;
  const { error: updateError } = await supabaseAdmin
    .from("spark_snapshots")
    .update({ cover_url: coverUrl })
    .eq("id", id)
    .eq("user_id", user.userId);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    game: {
      id,
      coverUrl,
    },
  });
}
