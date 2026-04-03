/** 与 cli/src/preview.ts 中 parseUnifiedDiff 保持一致（供浏览器端解析流式/队列 diff） */
export type UnifiedDiffHunk = {
  index: number;
  rawHeader: string;
  rawLines: string[];
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
};

export function parseUnifiedDiff(diffText: string): UnifiedDiffHunk[] {
  const lines = diffText.replace(/\r\n/g, "\n").split("\n");
  const hunks: UnifiedDiffHunk[] = [];
  let current: UnifiedDiffHunk | null = null;
  let idx = 0;
  const headerRe = /^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/;
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (current) hunks.push(current);
      current = {
        index: idx++,
        rawHeader: line,
        rawLines: [],
        oldStart: Number(m[1]),
        oldLines: m[2] ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newLines: m[4] ? Number(m[4]) : 1,
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-")) {
      current.rawLines.push(line);
    }
  }
  if (current) hunks.push(current);
  return hunks;
}
