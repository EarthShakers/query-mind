import { ingestDocument, type ChunkStrategy, type ParentChildOptions } from "@/lib/rag";
import { extractText } from "@/lib/parsers";
import type { UploadProgress } from "@/lib/parsers";
import type { ExtractTextOptions, LlamaParseTier, ParseMode } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";
import { checkUploadRateLimit } from "@/lib/ratelimit";
import { getSpaceContext, DEMO_SPACE_ID } from "@/lib/auth";
import { checkFileLimit } from "@/lib/file-limits";
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
 * - Enterprise member: only active space
 * - Personal user: personal space
 * - Anonymous: DEMO_SPACE_ID (preset docs, read-only)
 */
function getReadableSpaceIds(ctx: ReturnType<typeof getSpaceContext>): string[] {
  const { activeSpaceId } = ctx;
  return activeSpaceId ? [activeSpaceId] : [];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const title = url.searchParams.get("title");
    const explicitSpaceId = url.searchParams.get("spaceId");
    const ctx = getSpaceContext(req);

    let spaceIds: string[];
    if (explicitSpaceId) {
      if (ctx.userId) {
        spaceIds = [explicitSpaceId];
      } else {
        // Anonymous: only allow DEMO_SPACE_ID
        spaceIds = explicitSpaceId === DEMO_SPACE_ID ? [DEMO_SPACE_ID] : [];
      }
    } else {
      spaceIds = getReadableSpaceIds(ctx);
    }

    // 查询单篇文档的所有 chunks
    if (title) {
      const orFilter = spaceIds.map((id) => `space_id.eq.${id}`).join(",");

      const { data, error } = await supabase
        .from("documents")
        .select("id, content, metadata, created_at")
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
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // 上传限流
    const rateLimited = await checkUploadRateLimit(req);
    if (rateLimited) return rateLimited;

    const ctx = getSpaceContext(req);
    const { userId, activeSpaceId, tenantId, spaceRole, tenantRole } = ctx;

    if (!userId) {
      return Response.json({ error: "请先注册或登录后再上传文件" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title =
      (formData.get("title") as string) || file?.name || "未命名文档";
    const rawLlamaTier = (formData.get("llamaParseTier") as string | null)?.trim().toLowerCase();
    const rawParseMode = (formData.get("parseMode") as string | null)?.trim().toLowerCase();
    const rawChunkStrategy = (formData.get("chunkStrategy") as string | null)?.trim().toLowerCase();

    const chunkStrategy: ChunkStrategy =
      rawChunkStrategy === "parentchild" || rawChunkStrategy === "parent_child"
        ? "parentChild"
        : rawChunkStrategy === "semantic"
          ? "semantic"
          : "standard";

    const rawParentChunkSize = formData.get("parentChunkSize") as string | null;
    const rawParentOverlap = formData.get("parentOverlap") as string | null;
    const rawChildChunkSize = formData.get("childChunkSize") as string | null;
    const rawChildOverlap = formData.get("childOverlap") as string | null;

    const chunkOptions: ParentChildOptions | undefined =
      rawParentChunkSize ||
      rawParentOverlap ||
      (chunkStrategy === "parentChild" && (rawChildChunkSize || rawChildOverlap))
        ? {
            parentChunkSize: rawParentChunkSize ? parseInt(rawParentChunkSize, 10) : undefined,
            parentOverlap: rawParentOverlap ? parseInt(rawParentOverlap, 10) : undefined,
            ...(chunkStrategy === "parentChild"
              ? {
                  childChunkSize: rawChildChunkSize ? parseInt(rawChildChunkSize, 10) : undefined,
                  childOverlap: rawChildOverlap ? parseInt(rawChildOverlap, 10) : undefined,
                }
              : {}),
          }
        : undefined;

    const llamaParseTier: LlamaParseTier | undefined =
      rawLlamaTier === "fast" ||
      rawLlamaTier === "cost_effective" ||
      rawLlamaTier === "agentic" ||
      rawLlamaTier === "agentic_plus"
        ? rawLlamaTier
        : undefined;

    const parseMode: ParseMode | undefined =
      rawParseMode === "local" || rawParseMode === "smart" || rawParseMode === "cloud"
        ? rawParseMode
        : undefined;

    const parseOptions: ExtractTextOptions = { llamaParseTier, parseMode };

    // Allow explicit spaceId from form data; fall back to active space
    const explicitSpaceId = formData.get("spaceId") as string | null;
    const uploadSpaceId = explicitSpaceId || activeSpaceId;

    if (!uploadSpaceId) {
      return Response.json({ error: "缺少目标空间" }, { status: 400 });
    }

    // Permission check for enterprise spaces
    if (tenantRole) {
      const canEdit = spaceRole === "admin" || spaceRole === "editor" || tenantRole === "admin";
      if (!canEdit) {
        return Response.json({ error: "没有上传权限，需要 editor 及以上角色" }, { status: 403 });
      }
    }

    // File upload limit check
    const limitBlocked = await checkFileLimit(req, uploadSpaceId);
    if (limitBlocked) return limitBlocked;

    if (!file) {
      return Response.json({ error: "请上传文件" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext ?? "")) {
      return Response.json({ error: "仅支持 .txt、.md、.pdf 和 .docx 文件" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: "文件大小不能超过 20MB" }, { status: 400 });
    }

    // MIME 类型校验（pdf / docx）
    const allowedMimes = ext ? MIME_MAP[ext] : null;
    if (allowedMimes) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const detected = await fileTypeFromBuffer(buffer);
      if (!detected || !allowedMimes.includes(detected.mime)) {
        return Response.json({ error: "文件内容与扩展名不匹配，请上传真实的文件" }, { status: 400 });
      }
    }

    // SSE streaming response
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    const signal = abortController.signal;

    // Detect client disconnect
    req.signal.addEventListener("abort", () => {
      abortController.abort();
    });

    const stream = new ReadableStream({
      async start(controller) {
        function send(data: UploadProgress) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // stream already closed
          }
        }

        try {
          // 同名文档覆盖：先删除旧 chunks
          await supabase
            .from("documents")
            .delete()
            .eq("title", title)
            .eq("space_id", uploadSpaceId);

          if (signal.aborted) throw new Error("上传已取消");

          send({ stage: "parsing", message: "正在解析文档..." });

          const content = await extractText(file, (p) => send(p), signal, parseOptions);

          if (signal.aborted) throw new Error("上传已取消");

          const chunks = await ingestDocument(
            title,
            content,
            { filename: file.name },
            uploadSpaceId,
            tenantId,
            (p) => send(p),
            signal,
            chunkStrategy,
            chunkOptions
          );

          send({ stage: "done", title, chunks });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "上传已取消") {
            send({ stage: "error", message: "上传已取消" });
          } else {
            send({ stage: "error", message: msg });
          }
        } finally {
          controller.close();
        }
      },
      cancel() {
        abortController.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = getSpaceContext(req);
    const { userId, spaceRole, tenantRole } = ctx;

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    const { title, spaceId } = await req.json();
    if (!title || !spaceId) {
      return Response.json({ error: "缺少 title 或 spaceId" }, { status: 400 });
    }

    // Permission check
    if (tenantRole) {
      const canEdit = spaceRole === "admin" || spaceRole === "editor" || tenantRole === "admin";
      if (!canEdit) {
        return Response.json({ error: "没有删除权限" }, { status: 403 });
      }
    }

    const { error, count } = await supabase
      .from("documents")
      .delete()
      .eq("title", title)
      .eq("space_id", spaceId);

    if (error) throw new Error(error.message);

    return Response.json({ success: true, deleted: count ?? 0 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
