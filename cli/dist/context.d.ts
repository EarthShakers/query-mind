export interface FileContext {
    projectStructure: string;
    files: Record<string, string>;
}
export declare function collectLocalContext(cwd: string): FileContext;
