import { type AppConfig } from "./config.js";
export interface StartChatOptions {
    /** 预览 HTTP 端口；与 `spark preview -p` 一致 */
    previewPort?: number;
    /** 游戏子目录名，根目录为 <workspace>/games/<slug> */
    gameSlug?: string;
}
export declare function startChat(config: AppConfig, workspaceRoot: string, options?: StartChatOptions): Promise<void>;
