import fs from "node:fs";
import path from "node:path";
import ignore from "ignore";
const ALWAYS_IGNORE = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.svg",
    "*.ico",
    "*.mp3",
    "*.mp4",
    "*.wav",
    "*.woff",
    "*.woff2",
    "*.ttf",
    "*.eot",
    "*.zip",
    "*.tar",
    "*.gz",
];
export function collectLocalContext(cwd) {
    const ig = ignore();
    ig.add(ALWAYS_IGNORE);
    const gitignorePath = path.join(cwd, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
        ig.add(fs.readFileSync(gitignorePath, "utf-8"));
    }
    const files = {};
    let totalChars = 0;
    const MAX_CHARS = 32_000; // ~8000 tokens
    function walk(dir) {
        if (totalChars >= MAX_CHARS)
            return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (totalChars >= MAX_CHARS)
                break;
            const rel = path.relative(cwd, path.join(dir, entry.name));
            if (ig.ignores(rel))
                continue;
            if (entry.isDirectory()) {
                walk(path.join(dir, entry.name));
            }
            else if (entry.isFile()) {
                const fullPath = path.join(dir, entry.name);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.size > 50_000)
                        continue; // skip large files
                    const content = fs.readFileSync(fullPath, "utf-8");
                    if (totalChars + content.length > MAX_CHARS)
                        continue;
                    files[rel] = content;
                    totalChars += content.length;
                }
                catch {
                    // skip unreadable files
                }
            }
        }
    }
    walk(cwd);
    return {
        projectStructure: Object.keys(files).join("\n"),
        files,
    };
}
