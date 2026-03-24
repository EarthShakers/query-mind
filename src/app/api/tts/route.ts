import { NextRequest, NextResponse } from "next/server";
import { getModelConfig } from "@/lib/llm/model-config";

const DASHSCOPE_TTS_ENDPOINTS = [
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
] as const;

/**
 * POST /api/tts
 * body: { text: string, voice?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body?.text ?? "").trim();
    const voice = String(body?.voice ?? "Cherry");
    const proxyAudio = Boolean(body?.proxyAudio);
    if (!text) {
      return NextResponse.json({ error: "缺少 text" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json(
        { error: "文本过长，请控制在 2000 字以内" },
        { status: 400 }
      );
    }

    const apiKey = (process.env.DASHSCOPE_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "未配置 DASHSCOPE_API_KEY" },
        { status: 500 }
      );
    }

    const config = await getModelConfig();
    const modelCandidates = [
      config.modelTts,
      "qwen3-tts-flash",
      "qwen-tts-latest",
    ].filter(Boolean) as string[];

    let lastStatus = 500;
    let lastErr = "";
    for (const endpoint of DASHSCOPE_TTS_ENDPOINTS) {
      for (const model of modelCandidates) {
        const upstream = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: {
              text,
              voice,
              language_type: "Chinese",
            },
          }),
        });
        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => "");
          lastStatus = upstream.status || 500;
          lastErr = errText;
          console.error(
            `[TTS] upstream error endpoint=${endpoint} model=${model} status=${upstream.status} body=${errText}`
          );
          continue;
        }
        const payload = await upstream.json().catch(() => null);
        const audioUrl = payload?.output?.audio?.url as string | undefined;
        if (!audioUrl) {
          console.error(
            `[TTS] invalid payload endpoint=${endpoint} model=${model}`,
            JSON.stringify(payload)
          );
          continue;
        }
        const normalizedAudioUrl = audioUrl.replace(/^http:\/\//i, "https://");
        if (proxyAudio) {
          const audioRes = await fetch(normalizedAudioUrl, {
            headers: { Accept: "audio/*" },
          });
          if (!audioRes.ok || !audioRes.body) {
            const audioErr = await audioRes.text().catch(() => "");
            console.error(
              `[TTS] audio proxy error endpoint=${endpoint} model=${model} status=${audioRes.status} body=${audioErr}`
            );
            continue;
          }
          return new NextResponse(audioRes.body, {
            status: 200,
            headers: {
              "Content-Type":
                audioRes.headers.get("content-type") ?? "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
        }
        return NextResponse.json({
          audioUrl: normalizedAudioUrl,
          model,
          endpoint,
        });
      }
    }
    return NextResponse.json(
      {
        error: "TTS 服务请求失败",
        details: lastErr ? "请检查模型配置或区域设置" : "上游请求异常",
      },
      { status: lastStatus || 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS 服务异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
