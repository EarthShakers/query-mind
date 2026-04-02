export interface ToolCall {
    tool: string;
    args: Record<string, string>;
}
export interface ToolResult {
    success: boolean;
    message?: string;
    content?: string;
    error?: string;
}
export declare function executeTool(toolCall: ToolCall, cwd: string): Promise<ToolResult>;
