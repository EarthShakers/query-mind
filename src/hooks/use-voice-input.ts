"use client";

import { useState, useRef, useCallback } from "react";

interface UseVoiceInputOptions {
  /** 收到完整句子（最终结果）时调用 */
  onResult: (text: string) => void;
  onCorrected?: (text: string) => void;
  /** 收到中间识别结果时调用（可选，实现边录边显） */
  onPartial?: (text: string) => void;
  /** 错误时调用（用于 toast 等，不持久展示） */
  onError?: (message: string) => void;
  /** 录音时实时音量 0-1（用于波形展示） */
  onLevelChange?: (level: number) => void;
}

/** 从 WAV blob 解析出 PCM Int16 和采样率 */
async function parseWavToPcm(
  blob: Blob
): Promise<{ pcm: Int16Array; sampleRate: number } | null> {
  const ab = await blob.arrayBuffer();
  const view = new DataView(ab);
  if (ab.byteLength < 44) return null;
  if (
    String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    ) !== "RIFF"
  )
    return null;
  const sampleRate = view.getUint32(24, true);
  let dataOffset = 44;
  let dataSize = ab.byteLength - 44;
  for (let i = 12; i < ab.byteLength - 8; i++) {
    if (
      String.fromCharCode(
        view.getUint8(i),
        view.getUint8(i + 1),
        view.getUint8(i + 2),
        view.getUint8(i + 3)
      ) === "data"
    ) {
      dataOffset = i + 8;
      dataSize = view.getUint32(i + 4, true);
      break;
    }
  }
  if (dataSize <= 0) return null;
  const pcmBytes = ab.slice(dataOffset, dataOffset + dataSize);
  const pcm = new Int16Array(pcmBytes);
  return { pcm, sampleRate };
}

/** 内存保护：chunks 堆积上限，~18s @ 300ms/chunk */
const MAX_CHUNKS_BUFFERED = 60;

/** VAD：连续静音超过此时长则暂停发送，节省成本 */
const VAD_SILENT_MS = 1500;
const CHUNK_INTERVAL_MS = 100;
const VAD_SILENT_CHUNKS = Math.ceil(VAD_SILENT_MS / CHUNK_INTERVAL_MS);
const VAD_RMS_THRESHOLD = 260;
const PREAMBLE_SILENCE_SAMPLES = 3200;

/** 计算 Int16 PCM 的 RMS 能量 */
function pcmRms(pcm: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length);
}

function isAbortLikeError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("aborted") || msg.includes("aborterror");
  }
  return false;
}

/** AudioContext 单例，避免移动端频繁创建耗尽系统额度 */
let sharedAudioContext: AudioContext | null = null;
function getOrCreateAudioContext(): AudioContext {
  if (sharedAudioContext && sharedAudioContext.state !== "closed") {
    return sharedAudioContext;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  sharedAudioContext = new Ctor();
  return sharedAudioContext;
}

/**
 * 兼容 getUserMedia：优先 navigator.mediaDevices.getUserMedia，
 * 回退到旧版 navigator.getUserMedia（微信 WebView 等环境）。
 */
function getCompatUserMedia(
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyGetUserMedia =
    (navigator as any).getUserMedia ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).webkitGetUserMedia ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).mozGetUserMedia;
  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(navigator, constraints, resolve, reject);
    });
  }
  const isHTTP =
    typeof location !== "undefined" && location.protocol === "http:";
  const hint = isHTTP
    ? "录音功能需要 HTTPS，请使用 HTTPS 访问本站"
    : "当前浏览器不支持录音功能";
  return Promise.reject(new Error(hint));
}

/** 降采样 Int16 PCM 到 16kHz，线性插值比最近邻更平滑 */
function resampleTo16k(pcm: Int16Array, fromRate: number): Int16Array {
  if (fromRate <= 16000) return pcm;
  const ratio = fromRate / 16000;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    const a = pcm[Math.min(srcIdx, pcm.length - 1)];
    const b = pcm[Math.min(srcIdx + 1, pcm.length - 1)];
    out[i] = Math.max(
      -0x8000,
      Math.min(0x7fff, Math.round(a + (b - a) * frac))
    );
  }
  return out;
}

/** 缓存 RecordRTC 模块，避免重复动态导入 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRecordRTC: any = null;
async function getRecordRTC() {
  if (cachedRecordRTC) return cachedRecordRTC;
  cachedRecordRTC = (await import("recordrtc")).default;
  return cachedRecordRTC;
}

/** 构造 WebSocket URL：ws:// 或 wss:// 根据当前页面协议 */
function buildWsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

/** 安全的 Buffer 转 Base64，分块处理避免栈溢出 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 1024;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    );
  }
  return btoa(binary);
}

// ── Transport abstraction ──

interface AsrTransport {
  /** Send audio chunk (base64 or binary) */
  pushAudio(pcmBuffer: ArrayBuffer): void;
  /** Signal end of recording; returns final transcript */
  stop(): Promise<string>;
  /** Tear down the connection */
  close(): void;
}

/** WebSocket-based transport */
function createWsTransport(opts: {
  onPartial?: (text: string) => void;
  onText?: (text: string) => void;
  onCorrected?: (text: string) => void;
  onError?: (msg: string) => void;
  onDone?: () => void;
}): Promise<AsrTransport> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(buildWsUrl("/api/asr-ws"));
    let finalText = "";
    let stopResolve: ((text: string) => void) | null = null;
    let done = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "start" }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "started") {
          resolve({
            pushAudio(pcmBuffer: ArrayBuffer) {
              if (ws.readyState !== WebSocket.OPEN) return;
              // Send as binary frame — no base64 overhead
              ws.send(pcmBuffer);
            },
            stop() {
              return new Promise<string>((res) => {
                stopResolve = res;
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "stop" }));
                }
                // Timeout fallback
                setTimeout(() => {
                  if (stopResolve) {
                    stopResolve(finalText);
                    stopResolve = null;
                  }
                }, 15_000);
              });
            },
            close() {
              done = true;
              if (
                ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING
              ) {
                ws.close();
              }
            },
          });
        } else if (msg.type === "partial") {
          if (msg.text) opts.onPartial?.(msg.text);
        } else if (msg.type === "text") {
          if (msg.text) {
            finalText = msg.text;
            opts.onText?.(msg.text);
          }
        } else if (msg.type === "text_corrected") {
          if (msg.text) {
            finalText = msg.text;
            opts.onCorrected?.(msg.text);
          }
        } else if (msg.type === "done") {
          done = true;
          opts.onDone?.();
          if (stopResolve) {
            stopResolve(finalText);
            stopResolve = null;
          }
        } else if (msg.type === "error") {
          opts.onError?.(msg.error || "语音识别失败");
          if (stopResolve) {
            stopResolve(finalText);
            stopResolve = null;
          }
        }
      } catch {
        /* ignore */
      }
    };

    ws.onerror = () => {
      if (!done) reject(new Error("WebSocket 连接失败"));
    };

    ws.onclose = () => {
      if (!done) {
        opts.onDone?.();
        if (stopResolve) {
          stopResolve(finalText);
          stopResolve = null;
        }
      }
    };

    // Connection timeout（延长至 10s，弱网环境更稳定）
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        reject(new Error("WebSocket 连接超时"));
      }
    }, 10_000);
  });
}

/** HTTP POST + SSE fallback transport */
function createHttpTransport(opts: {
  onPartial?: (text: string) => void;
  onText?: (text: string) => void;
  onError?: (msg: string) => void;
  onDone?: () => void;
}): Promise<AsrTransport> {
  return (async () => {
    const res = await fetch("/api/asr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "无法启动语音识别");
    const sessionId = data.sessionId as string;

    // SSE for results
    const es = new EventSource(`/api/asr?sessionId=${sessionId}`);
    let finalText = "";

    es.addEventListener("partial", (e) => {
      const { text } = JSON.parse(e.data);
      if (text) opts.onPartial?.(text);
    });
    es.addEventListener("text", (e) => {
      const { text } = JSON.parse(e.data);
      if (text) {
        finalText = text;
        opts.onText?.(text);
      }
    });
    es.addEventListener("error", (e) => {
      try {
        const evt = e as MessageEvent;
        if (evt.data) {
          const { error: msg } = JSON.parse(evt.data);
          if (msg) opts.onError?.(msg);
        }
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("done", () => {
      opts.onDone?.();
      es.close();
    });

    let flushFailCount = 0;
    let sessionDead = false;

    return {
      pushAudio(pcmBuffer: ArrayBuffer) {
        if (sessionDead) return;
        const base64 = bufferToBase64(pcmBuffer);
        fetch("/api/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "push", sessionId, audio: base64 }),
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (data?.dropped) {
              sessionDead = true;
              opts.onError?.("会话已断开，请重新开始");
              opts.onDone?.();
            } else {
              flushFailCount = 0;
            }
          })
          .catch(() => {
            flushFailCount += 1;
            if (flushFailCount >= 5) {
              sessionDead = true;
              opts.onError?.("网络异常，请检查连接");
              opts.onDone?.();
              flushFailCount = 0;
            }
          });
      },
      async stop() {
        try {
          const stopRes = await fetch("/api/asr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "stop", sessionId }),
          });
          const stopData = await stopRes.json();
          const transcript = (stopData?.transcript ?? "") as string;
          if (transcript.trim()) finalText = transcript;
        } catch {
          /* ignore */
        }
        es.close();
        return finalText;
      },
      close() {
        es.close();
        // Fire-and-forget stop to clean up server session
        fetch("/api/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId }),
        }).catch(() => {});
      },
    } satisfies AsrTransport;
  })();
}

export function useVoiceInput({
  onResult,
  onCorrected,
  onPartial,
  onError,
  onLevelChange,
}: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<{
    startRecording: () => void;
    stopRecording: () => void;
  } | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const transportRef = useRef<AsrTransport | null>(null);
  const pushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const hasResultRef = useRef(false);
  const abortRef = useRef(false);
  const vadSilentCountRef = useRef(0);
  const vadPausedRef = useRef(false);
  const preambleSentRef = useRef(false);

  const cleanup = useCallback(() => {
    onLevelChange?.(0);
    if (pushIntervalRef.current) {
      clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    silentGainRef.current?.disconnect();
    silentGainRef.current = null;
    if (recorderRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try {
        (recorderRef.current as any).destroy?.();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
      sharedAudioContext = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    transportRef.current?.close();
    transportRef.current = null;
    vadSilentCountRef.current = 0;
    vadPausedRef.current = false;
    preambleSentRef.current = false;
  }, [onLevelChange]);

  /** 仅清理录音相关资源，保留 transport 以接收最终转写结果 */
  const cleanupRecordingOnly = useCallback(() => {
    onLevelChange?.(0);
    if (pushIntervalRef.current) {
      clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    silentGainRef.current?.disconnect();
    silentGainRef.current = null;
    if (recorderRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try {
        (recorderRef.current as any).destroy?.();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
      sharedAudioContext = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    vadSilentCountRef.current = 0;
    vadPausedRef.current = false;
    preambleSentRef.current = false;
  }, [onLevelChange]);

  const flushChunks = useCallback(() => {
    const transport = transportRef.current;
    if (!transport || chunksRef.current.length === 0) return;
    if (!preambleSentRef.current) {
      const preamble = new Int16Array(PREAMBLE_SILENCE_SAMPLES);
      transport.pushAudio(preamble.buffer);
      preambleSentRef.current = true;
    }

    const pending = chunksRef.current;
    chunksRef.current = [];

    const totalLen = pending.reduce((s, c) => s + c.length, 0);
    const merged = new Int16Array(totalLen);
    let off = 0;
    for (const c of pending) {
      merged.set(c, off);
      off += c.length;
    }

    transport.pushAudio(merged.buffer);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    hasResultRef.current = false;
    abortRef.current = false;
    vadSilentCountRef.current = 0;
    vadPausedRef.current = false;
    preambleSentRef.current = false;

    try {
      if (abortRef.current) return;

      setIsRecording(true);

      // ── 音频采集 & RecordRTC 加载 & ASR transport 创建 三者并行 ──

      // 1) 获取麦克风流
      const streamPromise = (async () => {
        let stream: MediaStream;
        try {
          const devices =
            (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
          const audioInputs = devices.filter((d) => d.kind === "audioinput");
          const preferred =
            audioInputs.find((d) =>
              /built-in|default|internal|麦克风/i.test(d.label)
            ) ?? audioInputs[0];
          stream = await getCompatUserMedia({
            audio: {
              ...(preferred?.deviceId
                ? { deviceId: { exact: preferred.deviceId } }
                : {}),
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch {
          try {
            stream = await getCompatUserMedia({
              audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
          } catch {
            stream = await getCompatUserMedia({ audio: true });
          }
        }
        return stream;
      })();

      // 2) 加载 RecordRTC（使用缓存，首次后秒加载）
      const recordRTCPromise = getRecordRTC();

      // 3) 创建 ASR transport — 优先 WebSocket，失败回退 HTTP
      const transportHandlers = {
        onPartial: (text: string) => {
          if (text) onPartial?.(text);
        },
        onText: (text: string) => {
          if (text) {
            hasResultRef.current = true;
            setIsTranscribing(false);
          }
        },
        onCorrected: (text: string) => {
          if (text) onCorrected?.(text);
        },
        onError: (msg: string) => {
          if (/aborted|abort/i.test(msg)) return;
          onError?.(msg);
          setIsTranscribing(false);
        },
        onDone: () => {
          setIsTranscribing(false);
          if (!hasResultRef.current) {
            onError?.("未识别到语音内容");
            setError(null);
          }
        },
      };

      const transportPromise = createWsTransport(transportHandlers).catch(
        (wsErr) => {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[Voice] WebSocket failed, retrying...",
              wsErr.message
            );
          }
          return createWsTransport(transportHandlers).catch((retryErr) => {
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "[Voice] WebSocket retry failed, falling back to HTTP:",
                retryErr.message
              );
            }
            return createHttpTransport(transportHandlers);
          });
        }
      );

      // ── 等待音频流 + RecordRTC 就绪 ──
      const [stream, RecordRTCModule] = await Promise.all([
        streamPromise,
        recordRTCPromise,
      ]);
      if (abortRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        cleanup();
        setIsRecording(false);
        return;
      }
      mediaStreamRef.current = stream;

      // 音量波形
      const audioCtx = getOrCreateAudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0.0001;
      analyser.connect(silentGain);
      silentGain.connect(audioCtx.destination);
      analyserRef.current = analyser;
      silentGainRef.current = silentGain;

      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArr);
        const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length;
        onLevelChange?.(Math.min(1, avg / 128));
        levelRafRef.current = requestAnimationFrame(tick);
      };
      levelRafRef.current = requestAnimationFrame(tick);

      // RecordRTC 录音 —— 立即启动，不等 transport
      const recorder = new RecordRTCModule(stream, {
        type: "audio",
        mimeType: "audio/wav",
        recorderType: (RecordRTCModule as { StereoAudioRecorder: unknown })
          .StereoAudioRecorder as import("recordrtc").Recorder,
        timeSlice: 120,
        desiredSampRate: 16000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        disableLogs: true,
        ondataavailable: async (blob: Blob) => {
          if (!blob || blob.size < 44) return;
          const parsed = await parseWavToPcm(blob);
          if (!parsed) return;
          const pcm =
            parsed.sampleRate === 16000
              ? parsed.pcm
              : resampleTo16k(parsed.pcm, parsed.sampleRate);
          if (pcm.length === 0) return;

          const rms = pcmRms(pcm);
          if (rms < VAD_RMS_THRESHOLD) {
            vadSilentCountRef.current += 1;
            if (vadSilentCountRef.current >= VAD_SILENT_CHUNKS) {
              vadPausedRef.current = true;
            }
          } else {
            vadSilentCountRef.current = 0;
            vadPausedRef.current = false;
          }

          if (!vadPausedRef.current) {
            const chunks = chunksRef.current;
            if (chunks.length >= MAX_CHUNKS_BUFFERED) chunks.shift();
            chunks.push(pcm);
          }
        },
      });
      recorderRef.current = recorder;
      recorder.startRecording();

      if (process.env.NODE_ENV === "development") {
        console.log(
          "[Voice] RecordRTC 已启动, 设备:",
          stream.getAudioTracks()[0]?.label
        );
      }

      // 启动 chunk 推送
      pushIntervalRef.current = setInterval(flushChunks, CHUNK_INTERVAL_MS);

      // ── 等待 transport 就绪 ──
      const transport = await transportPromise;
      if (abortRef.current) {
        transport.close();
        cleanup();
        setIsRecording(false);
        return;
      }
      transportRef.current = transport;

      if (process.env.NODE_ENV === "development") {
        console.log("[Voice] ASR transport ready");
      }
    } catch (err) {
      cleanup();
      setIsRecording(false);
      if (abortRef.current || isAbortLikeError(err)) {
        return;
      }
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "无法访问麦克风，请检查浏览器权限"
          : err instanceof Error
          ? err.message
          : "录音启动失败";
      onError?.(msg);
      setError(null);
    }
  }, [
    cleanup,
    flushChunks,
    onResult,
    onCorrected,
    onPartial,
    onError,
    onLevelChange,
  ]);

  const stopRecording = useCallback(async () => {
    abortRef.current = true;
    setIsRecording(false);

    const transport = transportRef.current;
    if (!transport) return;

    setIsTranscribing(true);

    if (pushIntervalRef.current) {
      clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }

    if (recorderRef.current) {
      recorderRef.current.stopRecording();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try {
        (recorderRef.current as any).destroy?.();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
    }
    cleanupRecordingOnly();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    // Flush remaining chunks
    await new Promise((r) => setTimeout(r, 50));
    flushChunks();

    try {
      const transcript = await transport.stop();
      if (transcript.trim()) {
        hasResultRef.current = true;
        onResult(transcript);
      } else if (!hasResultRef.current) {
        onError?.("未识别到语音内容");
      }
    } catch {
      if (!hasResultRef.current) onError?.("转写失败");
    } finally {
      setIsTranscribing(false);
      transportRef.current = null;
    }
  }, [cleanupRecordingOnly, flushChunks, onResult, onError]);

  const cancelRecording = useCallback(() => {
    abortRef.current = true;
    setIsRecording(false);
    setIsTranscribing(false);
    cleanup();
    chunksRef.current = [];
  }, [cleanup]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setError(null);
    setIsRecording(false);
    setIsTranscribing(false);
    cleanup();
    chunksRef.current = [];
  }, [cleanup]);

  return {
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
    reset,
  };
}
