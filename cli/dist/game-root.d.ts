/** 工作区下固定父目录，每个游戏为其中一级子目录 */
export declare const GAMES_PARENT_DIR = "games";
/** 规范化游戏子目录名，禁止路径穿越 */
export declare function normalizeGameSlug(raw: string): string;
export declare function resolveGamesParent(workspaceRoot: string): string;
export declare function listExistingGameSlugs(workspaceRoot: string): string[];
/** 游戏根目录：<workspace>/games/<slug> */
export declare function resolveGameRoot(workspaceRoot: string, gameSlug: string): string;
export declare function ensureGameRoot(gameRoot: string): void;
