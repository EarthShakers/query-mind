import net from "node:net";
/** 本机端口是否可 bind（用于在首选端口被「别的预览」占用时换端口） */
export function isLocalPortFree(port) {
    return new Promise((resolve) => {
        const s = net.createServer();
        s.once("error", () => resolve(false));
        s.listen(port, "127.0.0.1", () => {
            s.close(() => resolve(true));
        });
    });
}
export async function findFreeLocalPort(from, maxExclusive) {
    for (let p = from; p < maxExclusive; p++) {
        if (await isLocalPortFree(p))
            return p;
    }
    return null;
}
