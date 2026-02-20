import pdfParse from "pdf-parse";
import mammoth from "mammoth";

/**
 * 根据文件扩展名提取纯文本内容
 * 支持：.txt / .md / .pdf / .docx
 */
export async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "txt":
    case "md":
      return file.text();

    case "pdf": {
      const buf = Buffer.from(await file.arrayBuffer());
      const result = await pdfParse(buf);
      if (!result.text.trim()) {
        throw new Error("PDF 中未检测到文本内容（可能是扫描件）");
      }
      return result.text;
    }

    case "docx": {
      const buf = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer: buf });
      if (!result.value.trim()) {
        throw new Error("Word 文档中未检测到文本内容");
      }
      return result.value;
    }

    default:
      throw new Error(`不支持的文件格式: .${ext}`);
  }
}
