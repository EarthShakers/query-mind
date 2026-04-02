export interface AppConfig {
    token: string;
    apiBase: string;
}
/** 去掉尾部 /，便于拼接 /api/game */
export declare function normalizeApiBase(base: string): string;
export declare function loadConfig(): AppConfig;
export declare function saveConfig(config: Partial<AppConfig>): void;
