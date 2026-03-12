import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export type EmbedFn = (text: string) => Promise<number[]>;

export type ChunkStrategy = "standard" | "parentChild" | "semantic";

export interface ChunkWithHeaders {
  content: string;
  headers: string[];
  /** 父子模式：父块完整内容，检索时返回 */
  parentContent?: string;
  /** 父子模式：父块标识，用于去重 */
  parentId?: string;
}

const HEADER_RE = /^(#{1,4})\s+(.+)$/;
const DEFAULT_PARENT_CHUNK_SIZE = 800;
const DEFAULT_PARENT_OVERLAP = 100;
const DEFAULT_CHILD_CHUNK_SIZE = 300;
const DEFAULT_CHILD_OVERLAP = 50;

export interface ParentChunkOptions {
  parentChunkSize?: number;
  parentOverlap?: number;
}

export interface ParentChildOptions extends ParentChunkOptions {
  childChunkSize?: number;
  childOverlap?: number;
}

/** 标准：按 Markdown 标题 + 递归分隔符，支持父块参数 */
function splitMarkdown(
  text: string,
  options?: ParentChunkOptions
): ChunkWithHeaders[] {
  const maxLen = Math.min(1200, Math.max(400, options?.parentChunkSize ?? DEFAULT_PARENT_CHUNK_SIZE));
  const overlap = Math.min(maxLen - 50, Math.max(0, options?.parentOverlap ?? DEFAULT_PARENT_OVERLAP));

  const lines = text.split("\n");
  const sections: ChunkWithHeaders[] = [];
  const headerStack: string[] = [];
  let currentContent = "";

  function flushSection() {
    const trimmed = currentContent.trim();
    if (!trimmed) return;
    const headers = headerStack.filter(Boolean);
    if (trimmed.length <= maxLen) {
      sections.push({ content: trimmed, headers: [...headers] });
    } else {
      const subChunks = recursiveSplit(trimmed, maxLen, overlap);
      for (const sub of subChunks) {
        sections.push({ content: sub, headers: [...headers] });
      }
    }
    currentContent = "";
  }

  for (const line of lines) {
    const match = line.match(HEADER_RE);
    if (match) {
      flushSection();
      const level = match[1].length;
      const title = match[2].trim();
      headerStack[level - 1] = title;
      for (let i = level; i < headerStack.length; i++) headerStack[i] = "";
    } else {
      currentContent += (currentContent ? "\n" : "") + line;
    }
  }
  flushSection();

  if (sections.length === 0 && text.trim()) {
    const subChunks = recursiveSplit(text.trim(), maxLen, overlap);
    return subChunks.map((c) => ({ content: c, headers: [] }));
  }
  return sections;
}

function recursiveSplit(
  text: string,
  maxLen: number,
  overlap: number
): string[] {
  if (text.length <= maxLen) return [text];
  const separators = ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " "];
  for (const sep of separators) {
    const parts = text.split(sep);
    if (parts.length <= 1) continue;
    const chunks: string[] = [];
    let current = "";
    for (const part of parts) {
      const candidate = current ? current + sep + part : part;
      if (candidate.length > maxLen && current) {
        chunks.push(current.trim());
        const tail = current.slice(-overlap);
        current = tail + sep + part;
      } else {
        current = candidate;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    if (chunks.length > 1) return chunks;
  }
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen - overlap) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

/** 父子：父块用标准切分，子块用 LangChain 小粒度切分；embed 子块，存父块内容 */
export async function splitParentChild(
  text: string,
  options?: ParentChildOptions
): Promise<ChunkWithHeaders[]> {
  const childSize = Math.min(600, Math.max(100, options?.childChunkSize ?? DEFAULT_CHILD_CHUNK_SIZE));
  const childOverlap = Math.min(
    childSize - 20,
    Math.max(0, options?.childOverlap ?? DEFAULT_CHILD_OVERLAP)
  );

  const parents = splitMarkdown(text, options);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: childSize,
    chunkOverlap: childOverlap,
    separators: ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " "],
  });

  const result: ChunkWithHeaders[] = [];
  for (let i = 0; i < parents.length; i++) {
    const parent = parents[i];
    const parentContent =
      (parent.headers.length ? `**${parent.headers.join(" > ")}**\n\n` : "") +
      parent.content;
    const children = await splitter.splitText(parent.content);
    for (const child of children) {
      if (!child.trim()) continue;
      result.push({
        content: child,
        headers: parent.headers,
        parentContent,
        parentId: `p${i}`,
      });
    }
  }
  return result;
}

/** 语义边界：按句子切分，用 embedding 相似度找边界 */
const SENTENCE_SEP = /[。！？\n]+|[.!?]+\s*/g;

export async function splitSemantic(
  text: string,
  embedFn: EmbedFn,
  parentChunkOptions?: ParentChunkOptions
): Promise<ChunkWithHeaders[]> {
  const parents = splitMarkdown(text, parentChunkOptions);
  const result: ChunkWithHeaders[] = [];

  for (const parent of parents) {
    const sentences = parent.content
      .split(SENTENCE_SEP)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length <= 1) {
      result.push(parent);
      continue;
    }

    const embeddings: number[][] = [];
    for (const s of sentences) {
      if (!s) continue;
      const emb = await embedFn(s);
      embeddings.push(emb);
    }

    function cosineSim(a: number[], b: number[]): number {
      let dot = 0,
        na = 0,
        nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
    }

    const THRESHOLD = 0.5;
    const boundaries: number[] = [0];
    for (let i = 1; i < embeddings.length; i++) {
      const sim = cosineSim(embeddings[i - 1], embeddings[i]);
      if (sim < THRESHOLD) boundaries.push(i);
    }
    boundaries.push(sentences.length);

    for (let j = 0; j < boundaries.length - 1; j++) {
      const start = boundaries[j];
      const end = boundaries[j + 1];
      const chunkText = sentences.slice(start, end).join(" ").trim();
      if (chunkText.trim()) {
        result.push({ content: chunkText.trim(), headers: parent.headers });
      }
    }
  }
  return result;
}

/** 根据策略返回 chunks */
export async function getChunks(
  strategy: ChunkStrategy,
  content: string,
  embedFn?: EmbedFn,
  options?: ParentChildOptions
): Promise<ChunkWithHeaders[]> {
  const parentOpts: ParentChunkOptions | undefined = options
    ? { parentChunkSize: options.parentChunkSize, parentOverlap: options.parentOverlap }
    : undefined;

  switch (strategy) {
    case "standard":
      return splitMarkdown(content, parentOpts);
    case "parentChild":
      return splitParentChild(content, options);
    case "semantic":
      if (!embedFn) throw new Error("语义切分需要 embed 函数");
      return splitSemantic(content, embedFn, parentOpts);
    default:
      return splitMarkdown(content, parentOpts);
  }
}

/** 供 rag.ts 复用标准切分（保持向后兼容） */
export { splitMarkdown };
