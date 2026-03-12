import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import TurndownService from "turndown";
import { LlamaCloud, toFile } from "@llamaindex/llama-cloud";
import { supabaseAdmin } from "../supabase";

export interface UploadProgress {
  stage:
    | "parsing"
    | "chunking"
    | "summarizing"
    | "embedding"
    | "storing"
    | "done"
    | "error";
  message?: string;
  current?: number;
  total?: number;
  title?: string;
  chunks?: number;
}

export type LlamaParseTier =
  | "fast"
  | "cost_effective"
  | "agentic"
  | "agentic_plus";
export type ParseMode = "local" | "cloud" | "smart";

export interface ExtractTextOptions {
  llamaParseTier?: LlamaParseTier;
  parseMode?: ParseMode;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/* ─── LlamaParse: PDF / DOCX → Markdown（via @llamaindex/llama-cloud SDK） ─── */

// Polling intervals in seconds (SDK uses seconds, not ms).
const LLAMA_PARSE_POLL_INTERVAL_S = 2.5;
const LLAMA_PARSE_MAX_INTERVAL_S = 8;
const LLAMA_PARSE_IMAGE_BUCKET = process.env.RAG_IMAGE_BUCKET ?? "rag-images";
const LLAMA_PARSE_MAX_IMAGES = 20;
const LLAMA_PARSE_TIMEOUT_S = (() => {
  const raw = Number(process.env.LLAMA_PARSE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw / 1000 : 180;
})();

// 解析并返回最终使用的 LlamaParse 档位（优先参数，其次环境变量）。
function resolveLlamaParseTier(overrideTier?: LlamaParseTier): LlamaParseTier {
  if (
    overrideTier === "fast" ||
    overrideTier === "cost_effective" ||
    overrideTier === "agentic" ||
    overrideTier === "agentic_plus"
  ) {
    return overrideTier;
  }

  const envTier = process.env.LLAMA_PARSE_TIER;
  if (
    envTier === "fast" ||
    envTier === "cost_effective" ||
    envTier === "agentic" ||
    envTier === "agentic_plus"
  ) {
    return envTier;
  }
  return "cost_effective";
}

// 解析并返回最终解析模式（优先参数，其次环境变量，默认 smart）。
function resolveParseMode(overrideMode?: ParseMode): ParseMode {
  if (
    overrideMode === "local" ||
    overrideMode === "cloud" ||
    overrideMode === "smart"
  ) {
    return overrideMode;
  }

  const envMode = process.env.DOCUMENT_PARSE_MODE;
  if (envMode === "local" || envMode === "cloud" || envMode === "smart") {
    return envMode;
  }
  return "smart";
}

// 根据本地抽取文本特征，粗略判断 PDF 是否是复杂布局。
export function isLikelyComplexLayoutPdf(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return true;

  const multiSpaceColumns = lines.filter((line) =>
    /\S\s{3,}\S/.test(line)
  ).length;
  const tabSeparatedLines = lines.filter((line) => /\t/.test(line)).length;
  const tableLikeLines = lines.filter((line) => {
    const trimmed = line.trim();
    const pipeCount = (trimmed.match(/\|/g) ?? []).length;
    const markdownTableRow = pipeCount >= 2 && /^\|?.+\|.+\|?.*$/.test(trimmed);
    const markdownSeparatorRow =
      pipeCount >= 2 && /^[:\-\s|]{8,}$/.test(trimmed);
    const numericColumnsRow =
      /^(\s*[-+]?\d+(?:[.,]\d+)?\s+){3,}[-+]?\d+(?:[.,]\d+)?\s*$/.test(trimmed);
    return markdownTableRow || markdownSeparatorRow || numericColumnsRow;
  }).length;
  const shortLines = lines.filter((line) => line.length <= 32).length;

  const multiSpaceColumnRatio = multiSpaceColumns / lines.length;
  const tabRatio = tabSeparatedLines / lines.length;
  const tableRatio = tableLikeLines / lines.length;
  const shortLineRatio = shortLines / lines.length;

  // More conservative rules to avoid over-triggering cloud parse on simple resumes/two-column text.
  // Tabs are often introduced by local PDF extractors even for plain text layouts.
  if (tableLikeLines >= 2 && tableRatio > 0.12) return true;
  if (multiSpaceColumnRatio > 0.35) return true;
  if (multiSpaceColumnRatio > 0.2 && shortLineRatio > 0.5) return true;
  if (tabRatio > 0.6 && tableLikeLines >= 2) return true;

  return false;
}

// 判断一行是否像 PDF 抽取噪声（长串字母数字混合 token）。
function isSuspiciousArtifactLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;

  const compact = trimmed.replace(/\s+/g, "");
  if (compact.length < 20) return false;

  if (
    /^[A-Za-z0-9_]+$/.test(compact) &&
    /[A-Za-z]/.test(compact) &&
    /\d/.test(compact)
  ) {
    return true;
  }

  return false;
}

// 清洗本地 PDF 文本，去掉高频噪声行和连续重复行。
function cleanLocalPdfText(text: string): string {
  const trimmedLines = text.split(/\r?\n/).map((line) => line.trim());
  const lineFreq = new Map<string, number>();

  for (const line of trimmedLines) {
    if (!line) continue;
    lineFreq.set(line, (lineFreq.get(line) ?? 0) + 1);
  }

  const cleanedLines: string[] = [];
  let previous = "";
  for (const line of trimmedLines) {
    if (!line) {
      if (cleanedLines[cleanedLines.length - 1] !== "") cleanedLines.push("");
      continue;
    }

    const freq = lineFreq.get(line) ?? 0;
    if (isSuspiciousArtifactLine(line) && freq >= 2) continue;
    if (line === previous && line.length >= 8) continue;

    cleanedLines.push(line);
    previous = line;
  }

  return cleanedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 评估本地抽取文本质量，识别是否存在明显重复/噪声污染。
function isLowQualityLocalPdfText(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;

  const lineFreq = new Map<string, number>();
  for (const line of lines) {
    lineFreq.set(line, (lineFreq.get(line) ?? 0) + 1);
  }

  const suspiciousCount = lines.filter((line) =>
    isSuspiciousArtifactLine(line)
  ).length;
  const repeatedCount = lines.filter(
    (line) => (lineFreq.get(line) ?? 0) >= 3 && line.length >= 12
  ).length;

  const suspiciousRatio = suspiciousCount / lines.length;
  const repeatedRatio = repeatedCount / lines.length;

  return suspiciousRatio > 0.08 || repeatedRatio > 0.2;
}

type ParseImageItem = {
  filename?: string;
  presigned_url?: string;
};

function toSafeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extFromImageName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return ext;
  return "jpg";
}

async function uploadImageToStorage(
  image: ParseImageItem,
  sourceName: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (!image.presigned_url) return null;
  if (!supabaseAdmin) return image.presigned_url;

  const response = await fetch(image.presigned_url, { signal });
  if (!response.ok) return image.presigned_url;

  const bytes = Buffer.from(await response.arrayBuffer());
  const ext = extFromImageName(image.filename ?? "");
  const safeSource = toSafeFileName(sourceName.replace(/\.[^.]+$/, ""));
  const objectPath = `llamaparse/${safeSource}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(LLAMA_PARSE_IMAGE_BUCKET)
    .upload(objectPath, bytes, {
      contentType: response.headers.get("content-type") ?? `image/${ext}`,
      upsert: false,
    });

  if (error) return image.presigned_url;
  const { data } = supabaseAdmin.storage
    .from(LLAMA_PARSE_IMAGE_BUCKET)
    .getPublicUrl(objectPath);
  return data.publicUrl;
}

// 调用 LlamaParse SDK 上传并等待完成，返回 markdown 内容（图片插入对应页面）。
async function fileToMarkdownViaLlamaParse(
  buf: Buffer,
  filename: string,
  mimeType: string,
  tier: LlamaParseTier,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) return "";

  onProgress?.({
    stage: "parsing",
    message: "LlamaParse 上传中，请耐心等待...",
  });

  const client = new LlamaCloud({ apiKey });
  const uploadFile = await toFile(buf, filename, { type: mimeType });

  const result = await client.parsing.parse(
    {
      upload_file: uploadFile,
      tier,
      version: "latest",
      expand: ["markdown", "text", "images_content_metadata"],
      output_options: {
        markdown: {
          tables: { output_tables_as_markdown: true },
          inline_images: true,
          annotate_links: true,
        },
        // images_to_save: ["embedded"],
      },
    },
    {
      pollingInterval: LLAMA_PARSE_POLL_INTERVAL_S,
      maxInterval: LLAMA_PARSE_MAX_INTERVAL_S,
      timeout: LLAMA_PARSE_TIMEOUT_S,
      backoff: "linear",
      signal,
    }
  );

  onProgress?.({
    stage: "parsing",
    message: "LlamaParse 解析完成，处理图片中...",
  });

  // ── 1. Build filename → Supabase public URL map ──
  const images = (result.images_content_metadata?.images ?? []).slice(
    0,
    LLAMA_PARSE_MAX_IMAGES
  );
  const urlMap = new Map<string, string>();

  for (const img of images) {
    if (!img.presigned_url) continue;
    const publicUrl = await uploadImageToStorage(
      { filename: img.filename, presigned_url: img.presigned_url },
      filename,
      signal
    );
    if (publicUrl) urlMap.set(img.filename, publicUrl);
  }

  // ── 2. Assemble per-page markdown, replacing image filenames with public URLs ──
  const pages = result.markdown?.pages;
  if (!pages || pages.length === 0) {
    throw new Error("LlamaParse succeeded but returned no pages");
  }

  const parts = pages.map((page) => {
    if (!("markdown" in page)) return "";
    let md = page.markdown.trim();
    for (const [fname, url] of urlMap) {
      md = md.replaceAll(`(${fname})`, `(${url})`);
    }
    return md;
  });

  const content = parts.filter(Boolean).join("\n\n---\n\n");
  if (!content.trim()) {
    throw new Error("LlamaParse succeeded but returned empty content");
  }
  return content;
}

/* ─── DOCX → Markdown（mammoth HTML + turndown） ─── */

// 本地解析 DOCX：先转 HTML，再转 Markdown。
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
// 按文件类型选择本地/云端解析策略，并返回统一文本结果。
export async function extractText(
  file: File,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
  options: ExtractTextOptions = {}
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "txt":
    case "md":
      return file.text();

    case "pdf": {
      const buf = Buffer.from(await file.arrayBuffer());
      const apiKey = process.env.LLAMA_CLOUD_API_KEY;
      const tier = resolveLlamaParseTier(options.llamaParseTier);
      const parseMode = resolveParseMode(options.parseMode);

      onProgress?.({ stage: "parsing", message: "正在解析 PDF..." });

      if (parseMode === "cloud" && !apiKey) {
        throw new Error("云端解析需要配置 LLAMA_CLOUD_API_KEY");
      }

      if (parseMode === "local" || !apiKey) {
        const result = await pdfParse(buf);
        if (!result.text.trim()) {
          throw new Error("PDF 中未检测到文本内容（可能是扫描件）");
        }
        return cleanLocalPdfText(result.text);
      }

      if (parseMode === "cloud") {
        const markdown = await fileToMarkdownViaLlamaParse(
          buf,
          file.name,
          "application/pdf",
          tier,
          onProgress,
          signal
        );
        if (!markdown.trim()) {
          throw new Error("LlamaParse 未返回有效内容");
        }
        return markdown;
      }

      // smart: 先本地提取，疑似复杂版式再走 LlamaParse
      const localResult = await pdfParse(buf);
      const localText = localResult.text?.trim() ?? "";
      if (!localText) {
        onProgress?.({
          stage: "parsing",
          message: "检测到低文本 PDF，尝试云端解析...",
        });
        const markdown = await fileToMarkdownViaLlamaParse(
          buf,
          file.name,
          "application/pdf",
          tier,
          onProgress,
          signal
        );
        if (!markdown.trim()) {
          throw new Error("PDF 中未检测到文本内容（可能是扫描件）");
        }
        return markdown;
      }

      const cleanedLocalText = cleanLocalPdfText(localText);
      const localQualityPoor = isLowQualityLocalPdfText(localText);

      if (localQualityPoor) {
        onProgress?.({
          stage: "parsing",
          message: "检测到本地解析噪声，尝试云端增强解析...",
        });
        try {
          const markdown = await fileToMarkdownViaLlamaParse(
            buf,
            file.name,
            "application/pdf",
            tier,
            onProgress,
            signal
          );
          if (markdown.trim()) return markdown;
        } catch (error) {
          if (signal?.aborted) throw error;
          console.log("fileToMarkdownViaLlamaParse error", error);
        }
      }

      if (!isLikelyComplexLayoutPdf(cleanedLocalText)) {
        onProgress?.({
          stage: "parsing",
          message: "检测为纯文本布局，使用快速文本解析",
        });
        return cleanedLocalText;
      }

      onProgress?.({
        stage: "parsing",
        message: "检测到复杂布局，启用 LlamaParse 增强解析...",
      });
      try {
        const markdown = await fileToMarkdownViaLlamaParse(
          buf,
          file.name,
          "application/pdf",
          tier,
          onProgress,
          signal
        );
        if (markdown.trim()) return markdown;
      } catch (error) {
        if (signal?.aborted) throw error;
        console.log("fileToMarkdownViaLlamaParse error", error);
      }

      onProgress?.({
        stage: "parsing",
        message: "LlamaParse 不可用，回退文本解析",
      });
      return cleanedLocalText;
    }

    case "docx": {
      onProgress?.({ stage: "parsing", message: "正在解析 Word 文档..." });
      const buf = Buffer.from(await file.arrayBuffer());
      const apiKey = process.env.LLAMA_CLOUD_API_KEY;
      const tier = resolveLlamaParseTier(options.llamaParseTier);
      const parseMode = resolveParseMode(options.parseMode);

      if (parseMode === "cloud") {
        if (!apiKey) throw new Error("云端解析需要配置 LLAMA_CLOUD_API_KEY");
        const markdown = await fileToMarkdownViaLlamaParse(
          buf,
          file.name,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          tier,
          onProgress,
          signal
        );
        if (!markdown.trim()) throw new Error("LlamaParse 未返回有效内容");
        return markdown;
      }

      // local/smart 默认优先本地；smart 不强制走云，避免无谓成本。
      return docxToMarkdown(buf);
    }

    default:
      throw new Error(`不支持的文件格式: .${ext}`);
  }
}
