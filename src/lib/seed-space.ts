import { readFileSync } from "fs";
import { join } from "path";
import { ingestDocument } from "@/lib/rag/rag";

const PRESET_DOCS = [
  "员工手册摘要.md",
  "公司报销制度.md",
  "常见问题FAQ.md",
  "产品使用指南.md",
];

/**
 * Seed a space with 4 preset markdown documents.
 * Reads from docs/ directory, ingests into vector store.
 * Metadata includes { preset: true } to exclude from file-limit counting.
 */
export async function seedSpaceWithDocs(
  spaceId: string,
  tenantId: string
): Promise<void> {
  const docsDir = join(process.cwd(), "docs");

  for (const filename of PRESET_DOCS) {
    try {
      const filePath = join(docsDir, filename);
      const content = readFileSync(filePath, "utf-8");
      const title = filename.replace(/\.md$/, "");

      await ingestDocument(
        title,
        content,
        { source: filename, preset: true },
        spaceId,
        tenantId
      );
    } catch {
      // Skip individual doc failures — don't block space creation
    }
  }
}
