import fs from "node:fs";
import pathMod from "node:path";
import { normalizeApiBase } from "./config.js";
const IGNORE_DIRS = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "coverage",
    ".svn",
    "__pycache__",
]);
const ALLOWED_EXT = new Set([
    ".html",
    ".htm",
    ".js",
    ".mjs",
    ".cjs",
    ".css",
    ".json",
    ".ts",
    ".tsx",
    ".jsx",
    ".md",
    ".txt",
    ".svg",
    ".xml",
]);
const MAX_FILE_BYTES = 600_000;
const MAX_TOTAL_SNAPSHOT_BYTES = 4 * 1024 * 1024;
function isPathInsideRoot(filePath, root) {
    const resolved = pathMod.resolve(filePath);
    const rootResolved = pathMod.resolve(root);
    return resolved === rootResolved || resolved.startsWith(rootResolved + pathMod.sep);
}
export function collectSparkGameFiles(cwd) {
    const root = pathMod.resolve(cwd);
    const out = {};
    let total = 0;
    function walk(dir, relPrefix) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const ent of entries) {
            if (ent.name.startsWith("."))
                continue;
            if (IGNORE_DIRS.has(ent.name))
                continue;
            const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
            const full = pathMod.join(dir, ent.name);
            if (!isPathInsideRoot(full, root))
                continue;
            if (ent.isDirectory()) {
                walk(full, rel);
                continue;
            }
            const ext = pathMod.extname(ent.name).toLowerCase();
            if (!ALLOWED_EXT.has(ext))
                continue;
            let stat;
            try {
                stat = fs.statSync(full);
            }
            catch {
                continue;
            }
            if (!stat.isFile() || stat.size > MAX_FILE_BYTES)
                continue;
            let text;
            try {
                text = fs.readFileSync(full, "utf-8");
            }
            catch {
                continue;
            }
            const key = rel.replace(/\\/g, "/");
            const add = Buffer.byteLength(key, "utf-8") + Buffer.byteLength(text, "utf-8");
            if (total + add > MAX_TOTAL_SNAPSHOT_BYTES)
                return;
            total += add;
            out[key] = text;
        }
    }
    walk(root, "");
    return out;
}
export async function pushSparkSnapshot(config, cwd, slug = "default") {
    if (!config.token?.trim()) {
        return { ok: false, error: "未设置 token：请先 spark login（浏览器 Cookie qm_session）" };
    }
    const files = collectSparkGameFiles(cwd);
    if (Object.keys(files).length === 0) {
        return { ok: false, error: "没有可同步的文件（检查扩展名与目录）" };
    }
    const url = `${normalizeApiBase(config.apiBase)}/api/spark/snapshot`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Cookie: `qm_session=${config.token.trim()}`,
        },
        body: JSON.stringify({ slug, files }),
    });
    const text = await res.text();
    let body = {};
    try {
        body = JSON.parse(text);
    }
    catch {
        /* ignore */
    }
    if (!res.ok) {
        return {
            ok: false,
            error: body.error || `HTTP ${res.status}: ${text.slice(0, 200)}`,
        };
    }
    return { ok: true };
}
