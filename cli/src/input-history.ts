import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const SPARK_INPUT_HISTORY_MAX = 20;

const HISTORY_PATH = path.join(os.homedir(), ".spark_input_history.json");

function readLines(): string[] {
  try {
    const raw = fs.readFileSync(HISTORY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Oldest first, newest last — matches Node readline `history` option. */
export function loadSparkInputHistory(): string[] {
  return readLines().slice(-SPARK_INPUT_HISTORY_MAX);
}

/** Append one submitted line; dedupe consecutive duplicates; cap at max. */
export function appendSparkInputHistory(line: string): void {
  const t = line.trim();
  if (!t) return;
  const prev = readLines();
  const next =
    prev.length && prev[prev.length - 1] === t ? prev : [...prev, t];
  const capped = next.slice(-SPARK_INPUT_HISTORY_MAX);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(capped, null, 0), "utf-8");
}
