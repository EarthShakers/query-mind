/** 探测本机是否已有 spark 预览壳（/spark 可访问） */
export declare function probeSparkPreviewShell(port: number): Promise<boolean>;
/** 读取预览服务报告的游戏根目录（用于与 spark game 对齐，避免串目录） */
export declare function fetchSparkPreviewGameRoot(port: number): Promise<string | null>;
