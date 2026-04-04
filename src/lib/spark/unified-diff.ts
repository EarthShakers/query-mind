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

function findHunkStart(lines: string[], startIdx: number, expectedOld: string[]): number {
  const maxDrift = 12;
  const n = expectedOld.length;
  const start = Math.max(0, startIdx - maxDrift);
  const end = Math.min(lines.length - n, startIdx + maxDrift);
  for (let i = start; i <= end; i += 1) {
    let ok = true;
    for (let j = 0; j < n; j += 1) {
      if (lines[i + j] !== expectedOld[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function collectAllMatches(lines: string[], expectedOld: string[]): number[] {
  const out: number[] = [];
  const n = expectedOld.length;
  if (n === 0) return out;
  for (let i = 0; i <= lines.length - n; i += 1) {
    let ok = true;
    for (let j = 0; j < n; j += 1) {
      if (lines[i + j] !== expectedOld[j]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

function resolveHunkSpliceStart(lines: string[], hunk: UnifiedDiffHunk): number {
  const expectedOld = hunk.rawLines
    .filter((line) => !line.startsWith("+"))
    .map((line) => line.slice(1));
  let startIdx = Math.max(0, hunk.oldStart - 1);
  if (expectedOld.length > 0) {
    const candidate = lines.slice(startIdx, startIdx + expectedOld.length);
    const exact =
      candidate.length === expectedOld.length &&
      candidate.every((line, i) => line === expectedOld[i]);
    if (!exact) {
      const found = findHunkStart(lines, startIdx, expectedOld);
      if (found >= 0) startIdx = found;
    }
  } else {
    startIdx = Math.min(lines.length, startIdx);
  }
  return startIdx;
}

export function applyOneHunkToText(
  original: string,
  hunk: UnifiedDiffHunk
): { ok: boolean; text: string } {
  const lines = original.replace(/\r\n/g, "\n").split("\n");
  const oldBlock = hunk.rawLines
    .filter((line) => !line.startsWith("+"))
    .map((line) => line.slice(1));
  const newBlock = hunk.rawLines
    .filter((line) => !line.startsWith("-"))
    .map((line) => line.slice(1));

  let startIdx = resolveHunkSpliceStart(lines, hunk);
  if (oldBlock.length > 0) {
    const all = collectAllMatches(lines, oldBlock);
    if (all.length === 0) {
      return { ok: false, text: original };
    }
    const expected = Math.max(0, hunk.oldStart - 1);
    if (all.includes(expected)) {
      startIdx = expected;
    } else if (all.length === 1) {
      startIdx = all[0];
    } else {
      // 歧义位置，拒绝应用，避免把结构改坏
      return { ok: false, text: original };
    }
  } else if (startIdx < 0 || startIdx > lines.length) {
    return { ok: false, text: original };
  }

  lines.splice(startIdx, oldBlock.length, ...newBlock);
  return { ok: true, text: lines.join("\n") };
}
