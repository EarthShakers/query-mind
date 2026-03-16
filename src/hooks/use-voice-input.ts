"use client";

import { useState, useRef, useCallback } from "react";

interface UseVoiceInputOptions {
  /** 收到完整句子（最终结果）时调用 */
  onResult: (text: string) => void;
  /** 收到中间识别结果时调用（可选，实现边录边显） */
  onPartial?: (text: string) => void;
}

export function useVoiceInput({ onResult, onPartial }: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const hasResultRef = useRef(false);

  const cleanup = useCallback(() => {
    // 停止音频推送定时器
    if (pushIntervalRef.current) {
      clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }
    // 断开 AudioWorklet
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    // 关闭 AudioContext
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    // 停止麦克风
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    // 关闭 SSE
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

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

    try {
      if (!window.AudioWorkletNode) {
        throw new Error("当前浏览器不支持语音录制");
      }

      // 1. 创建后端 ASR 会话
      const res = await fetch("/api/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
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
        // SSE error event - could be connection error or server error
        try {
          const evt = e as MessageEvent;
          if (evt.data) {
            const { error: msg } = JSON.parse(evt.data);
            if (msg) setError(msg);
          }
        } catch {
          // connection error
        }
      });
      es.addEventListener("done", () => {
        setIsTranscribing(false);
        if (!hasResultRef.current) {
          setError("未识别到语音内容");
        }
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
      });

      // 3. 启动麦克风 + AudioWorklet（使用原生采样率，worklet 内降采样到 16kHz）
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      await audioCtx.audioWorklet.addModule("/worklets/pcm-processor.js");
      const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor", {
        processorOptions: { sampleRate: audioCtx.sampleRate },
      });
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (e: MessageEvent) => {
        chunksRef.current.push(new Int16Array(e.data));
      };

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(workletNode);

      // 4. 定时推送音频 (每 300ms)
      pushIntervalRef.current = setInterval(flushChunks, 300);

      setIsRecording(true);
    } catch (err) {
      cleanup();
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("无法访问麦克风，请检查浏览器权限");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("录音启动失败");
      }
    }
  }, [cleanup, flushChunks, onResult, onPartial]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
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
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await fetch("/api/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId: sid }),
        });
      } catch {
        // ignore
      }
    }
    // SSE 会收到 done 事件后自动关闭
  }, [flushChunks]);

  const cancelRecording = useCallback(() => {
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
