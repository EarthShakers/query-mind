import fs from "node:fs";
import path from "node:path";
import os from "node:os";
export const SPARK_INPUT_HISTORY_MAX = 20;
const HISTORY_PATH = path.join(os.homedir(), ".spark_input_history.json");
function readLines() {
    try {
        const raw = fs.readFileSync(HISTORY_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .filter((x) => typeof x === "string")
            .map((s) => s.trim())
            .filter(Boolean);
    }
    catch {
        return [];
    }
}
/**
 * 供 readline `history` 使用：须为「最新在前」。
 * 磁盘 JSON 按时间正序追加；第一次按 ⬆️ 应出现最后一条输入，故取末 N 条再 reverse。
 */
export function loadSparkInputHistory() {
    return readLines().slice(-SPARK_INPUT_HISTORY_MAX).reverse();
}
/** Append one submitted line; dedupe consecutive duplicates; cap at max. */
export function appendSparkInputHistory(line) {
    const t = line.trim();
    if (!t)
        return;
    const prev = readLines();
    const next = prev.length && prev[prev.length - 1] === t ? prev : [...prev, t];
    const capped = next.slice(-SPARK_INPUT_HISTORY_MAX);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(capped, null, 0), "utf-8");
}
