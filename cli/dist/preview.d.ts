export interface PreviewServer {
    port: number;
    close: () => void;
    setDraft: (draft: {
        path: string;
        content: string;
        note?: string;
    } | null) => void;
}
export declare function startPreviewServer(gameDir: string, port?: number): PreviewServer;
