export declare const SPARK_INPUT_HISTORY_MAX = 20;
/** Oldest first, newest last — matches Node readline `history` option. */
export declare function loadSparkInputHistory(): string[];
/** Append one submitted line; dedupe consecutive duplicates; cap at max. */
export declare function appendSparkInputHistory(line: string): void;
