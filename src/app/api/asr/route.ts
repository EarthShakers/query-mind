import { NextRequest, NextResponse } from "next/server";
import { getModelConfig } from "@/lib/llm/model-config";
import { transcribeWithDashScope } from "@/lib/asr/dashscope-asr";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    if (!file) {
      return NextResponse.json({ error: "缺少音频文件" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "音频文件过大" }, { status: 400 });
    }

    const config = await getModelConfig();
    const pcmBuffer = Buffer.from(await file.arrayBuffer());
    const text = await transcribeWithDashScope(pcmBuffer, config.modelAsr);

    return NextResponse.json({ text });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "语音识别服务异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
