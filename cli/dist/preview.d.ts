export interface PreviewServer {
    port: number;
    close: () => void;
    setDraft: (draft: {
        path: string;
        content: string;
        note?: string;
    } | null) => void;
}
export interface GameCatalogEntry {
    slug: string;
    title: string;
    /** 相对游戏根目录的封面路径，无则为 null（前端用占位图） */
    cover: string | null;
}
export declare function startPreviewServer(gameDir: string, port?: number): PreviewServer;
