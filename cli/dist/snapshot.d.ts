import { type AppConfig } from "./config.js";
export declare function collectSparkGameFiles(cwd: string): Record<string, string>;
export declare function pushSparkSnapshot(config: AppConfig, cwd: string, slug?: string): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
}>;
