import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/auth";
import {
  getModelConfig,
  saveModelConfig,
  type ModelConfig,
} from "@/lib/llm/model-config";

/** GET: 获取当前模型配置（需 superAdmin） */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "superAdmin") {
    return NextResponse.json({ error: "需要超级管理员权限" }, { status: 403 });
  }

  try {
    const config = await getModelConfig();
    return NextResponse.json(config);
  } catch (err) {
    console.error("[models/config] GET error:", err);
    return NextResponse.json({ error: "获取配置失败" }, { status: 500 });
  }
}

/** PUT: 保存模型配置（需 superAdmin） */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "superAdmin") {
    return NextResponse.json({ error: "需要超级管理员权限" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const config: ModelConfig = {
      modelChat: String(body.modelChat ?? "").trim() || "qwen-plus-2025-07-28",
      modelLight:
        String(body.modelLight ?? "").trim() || "qwen-plus-2025-07-28",
      modelAgent:
        String(body.modelAgent ?? "").trim() || "qwen-plus-2025-07-28",
      modelGame: String(body.modelGame ?? "").trim() || "glm-4.5",
      modelRerank: String(body.modelRerank ?? "").trim() || "qwen3-rerank",
      modelEmbedding:
        String(body.modelEmbedding ?? "").trim() || "text-embedding-v4",
      embeddingDimensions: Math.max(
        256,
        Math.min(
          4096,
          parseInt(String(body.embeddingDimensions ?? "1024"), 10) || 1024
        )
      ),
      modelAsr: String(body.modelAsr ?? "").trim() || "qwen-audio-asr-latest",
      modelTts: String(body.modelTts ?? "").trim() || "qwen-tts-latest",
      modelImageGen: String(body.modelImageGen ?? "").trim() || "qwen-image",
      modelVideoGen: String(body.modelVideoGen ?? "").trim() || "wanx-v1",
    };

    const ok = await saveModelConfig(config);
    if (!ok) {
      return NextResponse.json(
        { error: "保存失败，请确认已执行 scripts/app-settings-setup.sql" },
        { status: 500 }
      );
    }
    return NextResponse.json(config);
  } catch (err) {
    console.error("[models/config] PUT error:", err);
    return NextResponse.json({ error: "保存配置失败" }, { status: 500 });
  }
}
