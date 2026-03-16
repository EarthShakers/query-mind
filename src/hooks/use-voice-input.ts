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

export function useVoiceInput({ onResult, onPartial, onError, onLevelChange }: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const hasResultRef = useRef(false);

  // Abort flag — set by stopRecording / cancelRecording so that an in-flight
  // startRecording can bail out early at each await point.
  const abortRef = useRef(false);

  /** 检查麦克风权限：granted=已授权，denied=已拒绝，prompt=未询问。API 不支持时返回 granted 以继续尝试 */
  const checkMicrophonePermission = useCallback(async (): Promise<"granted" | "denied" | "prompt"> => {
    try {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      return result.state as "granted" | "denied" | "prompt";
    } catch {
      return "granted";
    }
  }, []);

  const cleanup = useCallback(() => {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    onLevelChange?.(0);
    analyserRef.current = null;
    if (pushIntervalRef.current) {
      clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, [onLevelChange]);

  /** 把累积的 PCM chunks 转为 base64 并 POST 到后端 */
  const flushChunks = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || chunksRef.current.length === 0) return;

    // 取出当前累积的 chunks
    const pending = chunksRef.current;
    chunksRef.current = [];

    // 合并
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
    } catch {
      // 网络错误静默处理，SSE 会报错
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    hasResultRef.current = false;
    abortRef.current = false;

    try {
      if (!window.AudioWorkletNode) {
        throw new Error("当前浏览器不支持语音录制");
      }

      const perm = await checkMicrophonePermission();
      if (abortRef.current) return;
      if (perm === "denied") {
        onError?.("麦克风权限已拒绝，请在浏览器设置中允许");
        return;
      }
      if (perm === "prompt") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          onError?.("无法访问麦克风，请检查浏览器权限");
        }
        return;
      }

      // Permission granted — mark recording active immediately so the overlay
      // appears without waiting for the heavy async setup below.
      setIsRecording(true);

      // 1. 创建后端 ASR 会话
      const res = await fetch("/api/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (abortRef.current) { cleanup(); setIsRecording(false); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "无法启动语音识别");
      const sessionId = data.sessionId as string;
      sessionIdRef.current = sessionId;

      // 2. 打开 SSE 接收文本
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
          onResult(text);
        }
      });
      es.addEventListener("error", (e) => {
        try {
          const evt = e as MessageEvent;
          if (evt.data) {
            const { error: msg } = JSON.parse(evt.data);
            if (msg) {
              onError?.(msg);
              setError(null);
            }
          }
        } catch {
          // connection error
        }
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

      if (abortRef.current) { cleanup(); setIsRecording(false); return; }

      // 3. 启动麦克风 + AudioWorklet（使用原生采样率，worklet 内降采样到 16kHz）
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (abortRef.current) { cleanup(); setIsRecording(false); return; }
      mediaStreamRef.current = stream;

      await audioCtx.audioWorklet.addModule("/worklets/pcm-processor.js");
      if (abortRef.current) { cleanup(); setIsRecording(false); return; }
      const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor", {
        processorOptions: { sampleRate: audioCtx.sampleRate },
      });
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (e: MessageEvent) => {
        chunksRef.current.push(new Int16Array(e.data));
      };

      const source = audioCtx.createMediaStreamSource(stream);
      let nodeToConnect: AudioNode = workletNode;

      if (onLevelChange) {
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyser.connect(workletNode);
        analyserRef.current = analyser;

        const data2 = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(data2);
          const avg = data2.reduce((a, b) => a + b, 0) / data2.length;
          onLevelChange(Math.min(1, avg / 128));
          levelRafRef.current = requestAnimationFrame(tick);
        };
        levelRafRef.current = requestAnimationFrame(tick);
      } else {
        source.connect(workletNode);
      }

      // 4. 定时推送音频 (每 300ms)
      pushIntervalRef.current = setInterval(flushChunks, 300);
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
  }, [cleanup, flushChunks, onResult, onPartial, onError, onLevelChange, checkMicrophonePermission]);

  const stopRecording = useCallback(async () => {
    // Signal any in-flight startRecording to abort
    abortRef.current = true;

    setIsRecording(false);

    // Only enter transcribing state if we actually created a session
    const sid = sessionIdRef.current;
    if (!sid) return;

    setIsTranscribing(true);

    // 停止定时推送，最后 flush 一次
    if (pushIntervalRef.current) {
      clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }

    // 断开音频
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    // 推送剩余音频
    await flushChunks();

    // 通知后端结束
    try {
      await fetch("/api/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", sessionId: sid }),
      });
    } catch {
      // ignore
    }
    // SSE 会收到 done 事件后自动关闭
  }, [flushChunks]);

  const cancelRecording = useCallback(() => {
    // Signal any in-flight startRecording to abort
    abortRef.current = true;

    setIsRecording(false);
    setIsTranscribing(false);

    // 通知后端结束（不关心结果）
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

/** ArrayBuffer → base64 (browser) */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
