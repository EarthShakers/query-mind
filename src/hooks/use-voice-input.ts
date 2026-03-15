"use client";

import { useState, useRef, useCallback } from "react";

interface UseVoiceInputOptions {
  onResult: (text: string) => void;
}

export function useVoiceInput({ onResult }: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);

  const cleanup = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];

    try {
      if (!window.AudioWorkletNode) {
        throw new Error("当前浏览器不支持语音录制");
      }

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;

      await audioCtx.audioWorklet.addModule("/worklets/pcm-processor.js");

      const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (e: MessageEvent) => {
        chunksRef.current.push(new Int16Array(e.data));
      };

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(workletNode);
      // workletNode 不连接 destination（不回放）

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
  }, [cleanup]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    cleanup();

    const chunks = chunksRef.current;
    if (chunks.length === 0) {
      setError("未录制到音频");
      return;
    }

    // 合并所有 Int16 chunks
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    chunksRef.current = [];

    const blob = new Blob([merged.buffer], { type: "audio/pcm" });
    const formData = new FormData();
    formData.append("audio", blob, "recording.pcm");

    setIsTranscribing(true);
    try {
      const res = await fetch("/api/asr", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "语音识别服务暂不可用");
      }

      if (!data.text) {
        setError("未识别到语音内容");
      } else {
        onResult(data.text);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("语音识别服务暂不可用");
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [cleanup, onResult]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const cancelRecording = useCallback(() => {
    setIsRecording(false);
    cleanup();
    chunksRef.current = [];
  }, [cleanup]);

  const reset = useCallback(() => {
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
