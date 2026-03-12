import type { ReportSection } from "../report-types";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";

function markdownToParagraphs(md: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const line of md.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: trimmed.slice(4) })],
        })
      );
    } else if (trimmed.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: trimmed.slice(3) })],
        })
      );
    } else if (trimmed.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: trimmed.slice(2) })],
        })
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: trimmed.slice(2) })],
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed })],
          spacing: { after: 120 },
        })
      );
    }
  }
  return paragraphs;
}

function tableDataToDocxTable(data: Record<string, unknown>[]): Paragraph[] {
  if (!data.length) return [];
  const keys = Object.keys(data[0]);

  const headerRow = new TableRow({
    children: keys.map(
      (k) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: k, bold: true, size: 20 })],
            }),
          ],
          width: { size: Math.floor(9000 / keys.length), type: WidthType.DXA },
        })
    ),
  });

  const bodyRows = data.slice(0, 200).map(
    (row) =>
      new TableRow({
        children: keys.map(
          (k) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: String(row[k] ?? ""), size: 20 }),
                  ],
                }),
              ],
            })
        ),
      })
  );

  const table = new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: 9000, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
  });

  return [new Paragraph({ spacing: { before: 200 } }), table as unknown as Paragraph];
}

export async function exportToWord(
  title: string,
  sections: ReportSection[]
): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title, bold: true })],
      spacing: { after: 400 },
    }),
  ];

  for (const section of sections) {
    if (section.title) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: section.title })],
          spacing: { before: 300, after: 150 },
        })
      );
    }

    if (section.content_type === "markdown" && section.content_markdown) {
      children.push(...markdownToParagraphs(section.content_markdown));
    }

    if (section.content_type === "table" && section.table_data?.data) {
      children.push(...tableDataToDocxTable(section.table_data.data));
    }

    if (section.content_type === "chart") {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "[图表内容请参考 PDF 导出]",
              italics: true,
              color: "888888",
            }),
          ],
          spacing: { before: 100, after: 100 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${title || "报告"}.docx`);
}
