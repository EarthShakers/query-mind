import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/auth";

/** 百炼兼容模式返回的模型项 */
interface DashScopeModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

/** 按类别分组的模型列表 */
export interface ModelsByCategory {
  chat: string[];
  rerank: string[];
  embedding: string[];
  /** 语音输入：ASR 语音转文字 */
  audioAsr: string[];
  /** 语音输出：TTS 文字转语音 */
  audioTts: string[];
  /** 图像生成：文生图、图生图、图像编辑 */
  imageGen: string[];
  /** 视频生成：文生视频、图生视频 */
  videoGen: string[];
}

/** 静态兜底：百炼官方文档中的常用模型 */
const FALLBACK_MODELS: ModelsByCategory = {
  chat: [
    "qvq-max-2025-03-25",
    "qwen3-max",
    "qwen3-max-preview",
    "qwen-max",
    "qwen-max-latest",
    "qwen3.5-plus",
    "qwen3.5-flash",
    "qwen-plus",
    "qwen-plus-latest",
    "qwen-flash",
    "qwen-turbo",
    "qwen3-coder-plus",
    "qwen3-coder-flash",
    "qwq-plus",
    "qwen-math-plus",
    "qwen-math-turbo",
    "qwen3-32b",
    "qwen3-14b",
    "qwen3-8b",
    "qwen2.5-72b-instruct",
    "qwen2.5-32b-instruct",
    "qwen2.5-14b-instruct",
    "qwen2.5-7b-instruct",
  ],
  rerank: ["gte-rerank-v2", "qwen3-vl-rerank", "qwen3-rerank"],
  embedding: [
    "tongyi-embedding-vision-flash",
    "qwen3-vl-embedding",
    "multimodal-embedding-v1",
    "text-embedding-v1",
    "tongyi-embedding-vision-plus",
    "text-embedding-v2",
    "text-embedding-v4",
    "qwen2.5-vl-embedding",
    "text-embedding-async-v1",
    "text-embedding-async-v2",
  ],
  audioAsr: [
    "qwen-audio-turbo",
    "qwen-audio-turbo-latest",
    "qwen-audio-asr-latest",
    "qwen-audio-asr",
    "fun-asr-mtl",
    "fun-asr-2025-11-07",
    "fun-asr-realtime-2025-09-15",
    "qwen3-asr-flash-2025-09-08",
    "fun-asr-2025-08-25",
    "fun-asr-flash-8k-realtime",
    "fun-asr-mtl-2025-08-25",
    "qwen3-asr-flash-filetrans",
    "fun-asr-flash-8k-realtime-2026-01-28",
    "qwen3-asr-flash-realtime-2026-02-10",
    "qwen3-asr-flash-realtime-2025-10-27",
    "qwen3-asr-flash-realtime",
    "fun-asr-realtime-2025-11-07",
    "qwen3-asr-flash-filetrans-2025-11-17",
    "fun-asr",
  ],
  audioTts: [
    "qwen3-tts-vd-2026-01-26",
    "gummy-realtime-v1",
    "qwen3-livetranslate-flash-realtime-2025-09-22",
    "qwen-tts-2025-05-22",
    "qwen-tts-realtime-latest",
    "qwen3-tts-instruct-flash",
    "qwen3-tts-vd-realtime-2026-01-15",
    "qwen-tts-realtime-2025-07-15",
    "qwen-tts-latest",
    "qwen3-tts-flash",
    "qwen3-tts-flash-realtime-2025-09-18",
    "qwen3-tts-vc-2026-01-22",
    "cosyvoice-v2",
    "qwen3-tts-flash-2025-11-27",
    "qwen-tts-realtime",
    "qwen-voice-design",
    "qwen3-tts-flash-realtime",
    "qwen-voice-enrollment",
    "qwen3-tts-flash-2025-09-18",
    "qwen3-tts-instruct-flash-2026-01-26",
    "qwen3-tts-vc-realtime-2025-11-27",
    "qwen-tts-2025-04-10",
    "qwen3-tts-instruct-flash-realtime-2026-01-22",
    "qwen3-tts-instruct-flash-realtime",
    "cosyvoice-v3-flash",
    "qwen3-tts-vc-realtime-2026-01-15",
    "qwen-tts",
  ],
  imageGen: [
    "qwen-image-edit-plus",
    "qwen-image-edit-plus-2025-10-30",
    "wanx-sketch-to-image-lite",
    "wan2.6-image",
    "wanx2.0-t2i-turbo",
    "wordart-semantic",
    "qwen-image-edit",
    "qwen-image",
    "wanx2.1-imageedit",
    "qwen-image-2.0",
    "z-image-turbo",
    "qwen-image-max-2025-12-30",
    "wanx2.1-t2i-turbo",
    "emoji-v1",
    "qwen-image-edit-max-2026-01-16",
    "wanx-style-repaint-v1",
    "wordart-texture",
    "emo-detect-v1",
    "aitryon-parsing-v1",
  ],
  videoGen: [
    "wanx-v1",
    "liveportrait-detect",
    "liveportrait",
    "wan2.6-t2v",
    "wan2.2-t2v-plus",
    "wan2.2-animate-move",
    "wanx2.1-i2v-turbo",
    "wanx2.1-t2v-plus",
    "wan2.6-i2v",
    "wan2.5-t2v-preview",
    "videoretalk",
  ],
};

function categorizeModel(id: string): keyof ModelsByCategory | null {
  const lower = id.toLowerCase();
  if (lower.includes("rerank")) return "rerank";
  if (lower.includes("embed") || lower.includes("embedding"))
    return "embedding";
  if (
    lower.includes("asr") ||
    (lower.includes("audio") && lower.includes("turbo"))
  )
    return "audioAsr";
  if (
    lower.includes("tts") ||
    lower.includes("cosyvoice") ||
    lower.includes("gummy") ||
    lower.includes("voice-design") ||
    lower.includes("voice-enrollment") ||
    lower.includes("livetranslate")
  )
    return "audioTts";
  if (
    lower.includes("t2v") ||
    lower.includes("i2v") ||
    lower.includes("liveportrait") ||
    lower.includes("videoretalk") ||
    lower.includes("animate-move") ||
    lower.includes("wanx-v1")
  )
    return "videoGen";
  if (
    lower.includes("t2i") ||
    lower.includes("image") ||
    lower.includes("sketch") ||
    lower.includes("wordart") ||
    lower.includes("emoji") ||
    lower.includes("emo-detect") ||
    lower.includes("parsing") ||
    lower.includes("repaint")
  )
    return "imageGen";
  if (
    lower.includes("qwen") ||
    lower.includes("deepseek") ||
    lower.includes("qwq") ||
    lower.includes("coder") ||
    lower.includes("math")
  ) {
    return "chat";
  }
  return "chat";
}

/** GET: 从百炼拉取可用模型列表，按类别分组 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "superAdmin") {
    return NextResponse.json({ error: "需要超级管理员权限" }, { status: 403 });
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(FALLBACK_MODELS);
  }

  try {
    const res = await fetch(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!res.ok) {
      return NextResponse.json(FALLBACK_MODELS);
    }

    const body = (await res.json()) as { data?: DashScopeModel[] };
    const items = body?.data ?? [];

    const chat = new Set<string>(FALLBACK_MODELS.chat);
    const rerank = new Set<string>(FALLBACK_MODELS.rerank);
    const embedding = new Set<string>(FALLBACK_MODELS.embedding);
    const audioAsr = new Set<string>(FALLBACK_MODELS.audioAsr);
    const audioTts = new Set<string>(FALLBACK_MODELS.audioTts);
    const imageGen = new Set<string>(FALLBACK_MODELS.imageGen);
    const videoGen = new Set<string>(FALLBACK_MODELS.videoGen);

    for (const m of items) {
      const id = m?.id?.trim();
      if (!id) continue;
      const cat = categorizeModel(id);
      if (cat === "chat") chat.add(id);
      else if (cat === "rerank") rerank.add(id);
      else if (cat === "embedding") embedding.add(id);
      else if (cat === "audioAsr") audioAsr.add(id);
      else if (cat === "audioTts") audioTts.add(id);
      else if (cat === "imageGen") imageGen.add(id);
      else if (cat === "videoGen") videoGen.add(id);
    }

    return NextResponse.json({
      chat: Array.from(chat).sort(),
      rerank: Array.from(rerank).sort(),
      embedding: Array.from(embedding).sort(),
      audioAsr: Array.from(audioAsr).sort(),
      audioTts: Array.from(audioTts).sort(),
      imageGen: Array.from(imageGen).sort(),
      videoGen: Array.from(videoGen).sort(),
    });
  } catch {
    return NextResponse.json(FALLBACK_MODELS);
  }
}
