/** 本机端口是否可 bind（用于在首选端口被「别的预览」占用时换端口） */
export declare function isLocalPortFree(port: number): Promise<boolean>;
export declare function findFreeLocalPort(from: number, maxExclusive: number): Promise<number | null>;
