"use client";

import { useState, useRef, useCallback } from "react";

interface UseVoiceInputOptions {
  /** 收到完整句子（最终结果）时调用 */
  onResult: (text: string) => void;
  /** 收到中间识别结果时调用（可选，实现边录边显） */
  onPartial?: (text: string) => void;
  /** 错误时调用（用于 toast 等，不持久展示） */
  onError?: (message: string) => void;
  /** 录音时实时音量 0-1（用于波形展示） */
  onLevelChange?: (level: number) => void;
}

/** 从 WAV blob 解析出 PCM Int16 和采样率 */
async function parseWavToPcm(blob: Blob): Promise<{ pcm: Int16Array; sampleRate: number } | null> {
  const ab = await blob.arrayBuffer();
  const view = new DataView(ab);
  if (ab.byteLength < 44) return null;
  if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== "RIFF") return null;
  const sampleRate = view.getUint32(24, true);
  let dataOffset = 44;
  let dataSize = ab.byteLength - 44;
  for (let i = 12; i < ab.byteLength - 8; i++) {
    if (String.fromCharCode(view.getUint8(i), view.getUint8(i + 1), view.getUint8(i + 2), view.getUint8(i + 3)) === "data") {
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
const VAD_SILENT_MS = 2000;
const VAD_SILENT_CHUNKS = Math.ceil(VAD_SILENT_MS / 300); // 7 chunks
const VAD_RMS_THRESHOLD = 400; // Int16 下环境底噪约 100-300，语音通常 >500

/** 计算 Int16 PCM 的 RMS 能量 */
function pcmRms(pcm: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length);
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
function getCompatUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  // 旧版 API fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyGetUserMedia = (navigator as any).getUserMedia
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    || (navigator as any).webkitGetUserMedia
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    || (navigator as any).mozGetUserMedia;
  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(navigator, constraints, resolve, reject);
    });
  }
  const isHTTP = typeof location !== "undefined" && location.protocol === "http:";
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
    out[i] = Math.max(-0x8000, Math.min(0x7fff, Math.round(a + (b - a) * frac)));
  }
  return out;
}

export function useVoiceInput({ onResult, onPartial, onError, onLevelChange }: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<{ startRecording: () => void; stopRecording: () => void } | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const hasResultRef = useRef(false);
  const abortRef = useRef(false);
  const flushFailCountRef = useRef(0);
  const vadSilentCountRef = useRef(0);
  const vadPausedRef = useRef(false);

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
    recorderRef.current = null;
    audioCtxRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    vadSilentCountRef.current = 0;
    vadPausedRef.current = false;
  }, [onLevelChange]);

  /** 仅清理录音相关资源，保留 EventSource 以接收最终转写结果 */
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
    recorderRef.current = null;
    audioCtxRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    vadSilentCountRef.current = 0;
    vadPausedRef.current = false;
  }, [onLevelChange]);

  const flushChunks = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || chunksRef.current.length === 0) return;

    const pending = chunksRef.current;
    chunksRef.current = [];

    const totalLen = pending.reduce((s, c) => s + c.length, 0);
    const merged = new Int16Array(totalLen);
    let off = 0;
    for (const c of pending) {
      merged.set(c, off);
      off += c.length;
    }

    const base64 = bufferToBase64(merged.buffer);
    try {
      await fetch("/api/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push", sessionId: sid, audio: base64 }),
      });
      flushFailCountRef.current = 0;
    } catch {
      flushFailCountRef.current += 1;
      if (flushFailCountRef.current >= 5) {
        onError?.("网络异常，请检查连接");
        flushFailCountRef.current = 0;
      }
    }
  }, [onError]);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    hasResultRef.current = false;
    abortRef.current = false;
    flushFailCountRef.current = 0;
    vadSilentCountRef.current = 0;
    vadPausedRef.current = false;

    try {
      if (abortRef.current) return;

      setIsRecording(true);

      // ── 关键优化：音频采集 & API 会话创建并行执行 ──
      // getUserMedia + RecordRTC 动态导入同时进行，让麦克风尽早开始录音，
      // 避免用户按下后前几个字丢失。
      // chunks 会缓存在 chunksRef 中，等 sessionId 就绪后由 flushChunks 发送。

      // 1) 获取麦克风流（与 API 请求并行）
      const streamPromise = (async () => {
        let stream: MediaStream;
        try {
          const devices = await navigator.mediaDevices?.enumerateDevices?.() ?? [];
          const audioInputs = devices.filter((d) => d.kind === "audioinput");
          const preferred = audioInputs.find((d) => /built-in|default|internal|麦克风/i.test(d.label)) ?? audioInputs[0];
          stream = await getCompatUserMedia({
            audio: {
              ...(preferred?.deviceId ? { deviceId: { exact: preferred.deviceId } } : {}),
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch {
          try {
            stream = await getCompatUserMedia({
              audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
            });
          } catch {
            stream = await getCompatUserMedia({ audio: true });
          }
        }
        return stream;
      })();

      // 2) 动态导入 RecordRTC（与上面并行）
      const recordRTCPromise = import("recordrtc").then((m) => m.default);

      // 3) 创建 ASR 会话（与上面并行）
      const sessionPromise = (async () => {
        const res = await fetch("/api/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "无法启动语音识别");
        return data.sessionId as string;
      })();

      // ── 等待音频流 + RecordRTC 就绪，立即开始录音 ──
      const [stream, RecordRTCModule] = await Promise.all([streamPromise, recordRTCPromise]);
      if (abortRef.current) { stream.getTracks().forEach((t) => t.stop()); cleanup(); setIsRecording(false); return; }
      mediaStreamRef.current = stream;

      // 音量波形：AnalyserNode 独立于 RecordRTC，复用单例 AudioContext
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

      // RecordRTC 采集 —— 立即启动，不等 session
      const recorder = new RecordRTCModule(stream, {
        type: "audio",
        mimeType: "audio/wav",
        recorderType: (RecordRTCModule as { StereoAudioRecorder: unknown }).StereoAudioRecorder as import("recordrtc").Recorder,
        timeSlice: 300,
        desiredSampRate: 16000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        disableLogs: true,
        ondataavailable: async (blob: Blob) => {
          if (!blob || blob.size < 44) return;
          const parsed = await parseWavToPcm(blob);
          if (!parsed) return;
          const pcm = parsed.sampleRate === 16000 ? parsed.pcm : resampleTo16k(parsed.pcm, parsed.sampleRate);
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
        console.log("[Voice] RecordRTC 已启动, 设备:", stream.getAudioTracks()[0]?.label);
      }

      // 启动 chunk 推送定时器（flushChunks 会检查 sessionId，为空时跳过）
      pushIntervalRef.current = setInterval(flushChunks, 300);

      // ── 等待 session 就绪，设置 sessionId 和 EventSource ──
      const sessionId = await sessionPromise;
      if (abortRef.current) { cleanup(); setIsRecording(false); return; }
      sessionIdRef.current = sessionId;

      const es = new EventSource(`/api/asr?sessionId=${sessionId}`);
      eventSourceRef.current = es;

      es.addEventListener("partial", (e) => {
        const { text } = JSON.parse(e.data);
        if (text) onPartial?.(text);
      });
      es.addEventListener("text", (e) => {
        const { text } = JSON.parse(e.data);
        if (text) {
          hasResultRef.current = true;
          setIsTranscribing(false);
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
        }
      });
      es.addEventListener("error", (e) => {
        try {
          const evt = e as MessageEvent;
          if (evt.data) {
            const { error: msg } = JSON.parse(evt.data);
            if (msg) onError?.(msg);
          }
        } catch {
          // 连接断开等，无 data
        }
        setIsTranscribing(false);
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
      });
      es.addEventListener("done", () => {
        setIsTranscribing(false);
        if (!hasResultRef.current) {
          onError?.("未识别到语音内容");
          setError(null);
        }
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
      });
    } catch (err) {
      cleanup();
      setIsRecording(false);
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "无法访问麦克风，请检查浏览器权限"
          : err instanceof Error
            ? err.message
            : "录音启动失败";
      onError?.(msg);
      setError(null);
    }
  }, [cleanup, flushChunks, onResult, onPartial, onError, onLevelChange]);

  const stopRecording = useCallback(async () => {
    abortRef.current = true;
    setIsRecording(false);

    const sid = sessionIdRef.current;
    if (!sid) return;

    setIsTranscribing(true);

    if (pushIntervalRef.current) {
      clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }

    if (recorderRef.current) {
      recorderRef.current.stopRecording();
      recorderRef.current = null;
    }
    // 不关闭 EventSource，需保持连接以接收 text/done 事件
    cleanupRecordingOnly();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    await new Promise((r) => setTimeout(r, 50));
    await flushChunks();

    try {
      const res = await fetch("/api/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", sessionId: sid }),
      });
      const data = await res.json();
      const transcript = (data?.transcript ?? "") as string;
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
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      sessionIdRef.current = null;
    }
  }, [cleanupRecordingOnly, flushChunks, onError]);

  const cancelRecording = useCallback(() => {
    abortRef.current = true;
    setIsRecording(false);
    setIsTranscribing(false);

    const sid = sessionIdRef.current;
    if (sid) {
      fetch("/api/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", sessionId: sid }),
      }).catch(() => {});
    }

    cleanup();
    chunksRef.current = [];
    sessionIdRef.current = null;
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
    sessionIdRef.current = null;
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

/** 安全的 Buffer 转 Base64，分块处理避免栈溢出 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 1024;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}
