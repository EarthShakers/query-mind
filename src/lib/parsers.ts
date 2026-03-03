import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import TurndownService from "turndown";

export interface UploadProgress {
  stage: "parsing" | "chunking" | "embedding" | "storing" | "done" | "error";
  message?: string;
  current?: number;
  total?: number;
  title?: string;
  chunks?: number;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/* ─── LlamaParse: PDF → Markdown（保留表格、标题结构） ─── */

const LLAMA_PARSE_BASE = "https://api.cloud.llamaindex.ai/api/v2";

async function pdfToMarkdownViaLlamaParse(
  buf: Buffer,
  filename: string,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) return "";

  // 1. 提交解析任务
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buf)], { type: "application/pdf" }),
    filename
  );
  form.append(
    "configuration",
    JSON.stringify({
      tier: "fast",
      version: "latest",
    })
  );

  const uploadRes = await fetch(`${LLAMA_PARSE_BASE}/parse/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`LlamaParse upload error (${uploadRes.status}): ${err}`);
  }

  const { id: jobId } = await uploadRes.json();

  // 2. 轮询结果（最多等 120 秒）
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) throw new Error("上传已取消");
    await new Promise((r) => setTimeout(r, 2000));

    onProgress?.({ stage: "parsing", message: `LlamaParse 解析中 (${i + 1}/${maxAttempts})` });

    const pollRes = await fetch(
      `${LLAMA_PARSE_BASE}/parse/${jobId}?expand=markdown`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!pollRes.ok) continue;

    const result = await pollRes.json();
    const jobStatus = result.job?.status ?? result.status;
    console.log(result, "result");
    console.log(`LlamaParse poll #${i + 1}: status=${jobStatus}`);
    if (jobStatus === "SUCCESS" || jobStatus === "COMPLETED") {
      // markdown.pages 是数组，每个元素含单页 markdown 内容

      console.log(result.markdown.pages[0], "resultmarkdown[0]");
      const pages = result.markdown?.pages;
      if (Array.isArray(pages)) {
        return pages
          .map(
            (p: { md?: string; markdown?: string; content?: string }) =>
              p.md ?? p.markdown ?? p.content ?? ""
          )
          .join("\n\n");
      }
      return result.markdown_full ?? result.text_full ?? "";
    }
    if (jobStatus === "ERROR" || jobStatus === "FAILED") {
      throw new Error(
        `LlamaParse job failed: ${result.job?.error_message ?? "unknown"}`
      );
    }
    // PENDING / STARTED → 继续轮询
  }

  throw new Error("LlamaParse timeout: 解析超时");
}

/* ─── DOCX → Markdown（mammoth HTML + turndown） ─── */

async function docxToMarkdown(buf: Buffer): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  if (!html.trim()) {
    throw new Error("Word 文档中未检测到文本内容");
  }
  return turndown.turndown(html);
}

/* ─── 主入口 ─── */

/**
 * 根据文件扩展名提取内容并转为 Markdown（保留表格、标题等结构）
 * 支持：.txt / .md / .pdf / .docx
 *
 * PDF：优先 LlamaParse API → 回退 pdf-parse 纯文本
 * DOCX：mammoth → HTML → turndown → Markdown
 */
export async function extractText(
  file: File,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "txt":
    case "md":
      return file.text();

    case "pdf": {
      const buf = Buffer.from(await file.arrayBuffer());

      onProgress?.({ stage: "parsing", message: "正在解析 PDF..." });

      // 优先使用 LlamaParse 转 Markdown（保留表格等结构）
      try {
        const markdown = await pdfToMarkdownViaLlamaParse(buf, file.name, onProgress, signal);
        if (markdown.trim()) return markdown;
      } catch (error) {
        if (signal?.aborted) throw error;
        console.log("pdfToMarkdownViaLlamaParse error", error);
      }

      onProgress?.({ stage: "parsing", message: "使用备用解析器..." });

      // 回退：纯文本提取
      const result = await pdfParse(buf);
      if (!result.text.trim()) {
        throw new Error("PDF 中未检测到文本内容（可能是扫描件）");
      }
      return result.text;
    }

    case "docx": {
      onProgress?.({ stage: "parsing", message: "正在解析 Word 文档..." });
      const buf = Buffer.from(await file.arrayBuffer());
      return docxToMarkdown(buf);
    }

    default:
      throw new Error(`不支持的文件格式: .${ext}`);
  }
}
