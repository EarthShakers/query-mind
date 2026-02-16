import { ingestDocument } from "@/lib/rag";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || file?.name || "未命名文档";

    if (!file) {
      return new Response("请上传文件", { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "md"].includes(ext ?? "")) {
      return new Response("仅支持 .txt 和 .md 文件", { status: 400 });
    }

    if (file.size > 1024 * 1024) {
      return new Response("文件大小不能超过 1MB", { status: 400 });
    }

    const content = await file.text();
    const chunks = await ingestDocument(title, content, {
      filename: file.name,
    });

    return Response.json({ success: true, title, chunks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(msg, { status: 500 });
  }
}
