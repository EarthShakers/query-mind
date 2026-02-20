import { ingestDocument } from "@/lib/rag";
import { extractText } from "@/lib/parsers";

const ALLOWED_EXTS = ["txt", "md", "pdf", "docx"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || file?.name || "未命名文档";

    if (!file) {
      return new Response("请上传文件", { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext ?? "")) {
      return new Response("仅支持 .txt、.md、.pdf 和 .docx 文件", { status: 400 });
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
