import { ingestDocument } from "@/lib/rag";
import { extractText } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";

const ALLOWED_EXTS = ["txt", "md", "pdf", "docx"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const title = url.searchParams.get("title");

    // 查询单篇文档的所有 chunks
    if (title) {
      const { data, error } = await supabase
        .from("documents")
        .select("id, content, created_at")
        .eq("title", title)
        .order("id", { ascending: true });

      if (error) throw new Error(error.message);
      return Response.json(data ?? []);
    }

    // 查询文档列表
    const { data, error } = await supabase
      .from("documents")
      .select("title, metadata, created_at")
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
      return new Response("文件大小不能超过 5MB", { status: 400 });
    }

    const content = await extractText(file);
    const chunks = await ingestDocument(title, content, {
      filename: file.name,
    });

    return Response.json({ success: true, title, chunks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(msg, { status: 500 });
  }
}
