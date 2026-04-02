/**
 * 若 apiBase 指向本机，则依次探测「当前配置端口 + 常见端口」，找到第一个可用的 /api/game。
 * 非本机 URL 原样返回（不做扫描）。
 * 设置环境变量 SPARK_NO_AUTO_PORT=1 可关闭自动探测。
 */
export declare function resolveLocalGameApiBase(apiBase: string): Promise<string>;
