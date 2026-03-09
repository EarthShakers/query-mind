import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * 种子脚本：将 docs/ 目录下的 Markdown 文档导入 Supabase 向量库
 *
 * 使用方式：
 *   npx tsx scripts/seed-docs.ts
 *
 * 需要配置 .env.local 中的：
 *   DASHSCOPE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
 */

// 加载 .env.local
import { config } from "dotenv";
config({ path: ".env" });

const DEMO_SPACE_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

// 动态导入避免顶层 env 未就绪
async function main() {
  const { ingestDocument } = await import("../src/lib/rag");

  const docsDir = join(process.cwd(), "docs");
  const files = readdirSync(docsDir).filter((f) => f.endsWith(".md"));

  if (!files.length) {
    console.log("docs/ 目录下没有 .md 文件");
    return;
  }

  console.log(`找到 ${files.length} 个文档，开始导入...`);
  console.log(`空间: ${DEMO_SPACE_ID}\n`);

  for (const file of files) {
    const title = file.replace(/\.md$/, "");
    const content = readFileSync(join(docsDir, file), "utf-8");

    try {
      const chunks = await ingestDocument(
        title,
        content,
        { source: file, preset: true },
        DEMO_SPACE_ID,
        DEMO_TENANT_ID
      );
      console.log(`  [OK] ${title} → ${chunks} 个片段`);
    } catch (err) {
      console.error(`  [ERR] ${title}:`, err);
    }
  }

  console.log("\n导入完成!");
}

main();
