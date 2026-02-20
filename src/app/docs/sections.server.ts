import React from "react";
import { readFileSync } from "fs";
import { join } from "path";

/** 从 CHANGELOG.md 解析版本记录 */
export function parseChangelog(): {
  version: string;
  date: string;
  items: string[];
}[] {
  const raw = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf-8");
  const sections: { version: string; date: string; items: string[] }[] = [];
  let current: { version: string; date: string; items: string[] } | null = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      const heading = line.replace("## ", "");
      const dateMatch = heading.match(/<sub>([\d-]+)<\/sub>/);
      const date = dateMatch ? dateMatch[1] : "";
      const version = heading.replace(/<sub>.*<\/sub>/, "").trim();
      current = { version, date, items: [] };
    } else if (line.startsWith("- ") && current) {
      current.items.push(line.replace("- ", ""));
    }
  }
  if (current) sections.push(current);
  return sections;
}

/** Parse inline markdown: **bold** and `code` into JSX */
export function renderInlineMarkdown(text: string) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf("**");
    const codeIdx = remaining.indexOf("`");

    if (boldIdx === -1 && codeIdx === -1) {
      parts.push(remaining);
      break;
    }

    const nextIdx =
      boldIdx === -1
        ? codeIdx
        : codeIdx === -1
          ? boldIdx
          : Math.min(boldIdx, codeIdx);

    if (nextIdx > 0) {
      parts.push(remaining.slice(0, nextIdx));
      remaining = remaining.slice(nextIdx);
    }

    if (remaining.startsWith("**")) {
      const endIdx = remaining.indexOf("**", 2);
      if (endIdx === -1) {
        parts.push(remaining);
        break;
      }
      parts.push(
        React.createElement("strong", { key: key++ }, remaining.slice(2, endIdx))
      );
      remaining = remaining.slice(endIdx + 2);
    } else if (remaining.startsWith("`")) {
      const endIdx = remaining.indexOf("`", 1);
      if (endIdx === -1) {
        parts.push(remaining);
        break;
      }
      parts.push(
        React.createElement(
          "code",
          {
            key: key++,
            className:
              "px-1.5 py-0.5 bg-slate-100 rounded text-[13px] font-mono text-indigo-600",
          },
          remaining.slice(1, endIdx)
        )
      );
      remaining = remaining.slice(endIdx + 1);
    }
  }

  return parts;
}
