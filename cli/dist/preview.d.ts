export interface PreviewServer {
    port: number;
    close: () => void;
}
export declare function startPreviewServer(gameDir: string, port?: number): PreviewServer;
