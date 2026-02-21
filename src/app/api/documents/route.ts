import { ingestDocument } from "@/lib/rag";
import { extractText } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";
import { checkUploadRateLimit } from "@/lib/ratelimit";
import { getSpaceContext, DEMO_SPACE_ID } from "@/lib/auth";
import { fileTypeFromBuffer } from "file-type";

const ALLOWED_EXTS = ["txt", "md", "pdf", "docx"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

/** 扩展名 → 合法 MIME 类型 */
const MIME_MAP: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip", // docx 本质是 zip
  ],
  // txt/md 是纯文本，file-type 无法识别，跳过 MIME 校验
};

/**
 * Determine which space IDs to query based on user context:
 * - Free user (no tenantRole): personal space + DEMO public space
 * - Enterprise member: only active space
 */
function getReadableSpaceIds(ctx: ReturnType<typeof getSpaceContext>): string[] {
  const { tenantRole, activeSpaceId } = ctx;

  if (tenantRole) {
    // Enterprise member: only their active space
    return [activeSpaceId || DEMO_SPACE_ID];
  }

  // Free user: personal space + demo public data
  if (activeSpaceId && activeSpaceId !== DEMO_SPACE_ID) {
    return [DEMO_SPACE_ID, activeSpaceId];
  }
  return [DEMO_SPACE_ID];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const title = url.searchParams.get("title");
    const ctx = getSpaceContext(req);
    const spaceIds = getReadableSpaceIds(ctx);

    // 查询单篇文档的所有 chunks
    if (title) {
      const orFilter = spaceIds.map((id) => `space_id.eq.${id}`).join(",");

      const { data, error } = await supabase
        .from("documents")
        .select("id, content, created_at")
        .eq("title", title)
        .or(orFilter)
        .order("id", { ascending: true });

      if (error) throw new Error(error.message);
      return Response.json(data ?? []);
    }

    // 查询文档列表
    const orFilter = spaceIds.map((id) => `space_id.eq.${id}`).join(",");

    const { data, error } = await supabase
      .from("documents")
      .select("title, metadata, created_at")
      .or(orFilter)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    // 按 title 分组，统计每篇文档的 chunk 数
    const map = new Map<
      string,
      { title: string; chunkCount: number; format: string; createdAt: string }
    >();
    for (const row of data ?? []) {
      const existing = map.get(row.title);
      if (existing) {
        existing.chunkCount++;
      } else {
        const meta = row.metadata as Record<string, string> | null;
        const filename = meta?.filename ?? meta?.source ?? "";
        const ext = filename.split(".").pop()?.toLowerCase() ?? "md";
        map.set(row.title, {
          title: row.title,
          chunkCount: 1,
          format: ext,
          createdAt: row.created_at,
        });
      }
    }

    return Response.json([...map.values()]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(msg, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // 上传限流
    const rateLimited = await checkUploadRateLimit(req);
    if (rateLimited) return rateLimited;

    const ctx = getSpaceContext(req);
    const { activeSpaceId, tenantId, spaceRole, tenantRole } = ctx;

    // Free users upload to their personal space (activeSpaceId)
    // Enterprise members upload to their active space
    const uploadSpaceId = activeSpaceId || DEMO_SPACE_ID;

    // Permission check for enterprise spaces
    if (tenantRole && uploadSpaceId !== DEMO_SPACE_ID) {
      const canEdit = spaceRole === "admin" || spaceRole === "editor" || tenantRole === "admin";
      if (!canEdit) {
        return new Response("没有上传权限，需要 editor 及以上角色", { status: 403 });
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title =
      (formData.get("title") as string) || file?.name || "未命名文档";

    if (!file) {
      return new Response("请上传文件", { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext ?? "")) {
      return new Response("仅支持 .txt、.md、.pdf 和 .docx 文件", {
        status: 400,
      });
    }

    if (file.size > MAX_SIZE) {
      return new Response("文件大小不能超过 20MB", { status: 400 });
    }

    // MIME 类型校验（pdf / docx）
    const allowedMimes = ext ? MIME_MAP[ext] : null;
    if (allowedMimes) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const detected = await fileTypeFromBuffer(buffer);
      if (!detected || !allowedMimes.includes(detected.mime)) {
        return new Response("文件内容与扩展名不匹配，请上传真实的文件", {
          status: 400,
        });
      }
    }

    const content = await extractText(file);
    const chunks = await ingestDocument(
      title,
      content,
      { filename: file.name },
      uploadSpaceId,
      tenantId
    );

    return Response.json({ success: true, title, chunks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(msg, { status: 500 });
  }
}
