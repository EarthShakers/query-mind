export declare const SPARK_INPUT_HISTORY_MAX = 20;
/**
 * 供 readline `history` 使用：须为「最新在前」。
 * 磁盘 JSON 按时间正序追加；第一次按 ⬆️ 应出现最后一条输入，故取末 N 条再 reverse。
 */
export declare function loadSparkInputHistory(): string[];
/** Append one submitted line; dedupe consecutive duplicates; cap at max. */
export declare function appendSparkInputHistory(line: string): void;
