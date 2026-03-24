"use client";

import { useCallback, useEffect, useRef } from "react";
import { getOrCreateAudioContext } from "@/lib/voice/browser-audio";

function buildTtsWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/tts-ws`;
}

function getTtsText(raw: string): string {
  const plain = raw.replace(/[#*_`>\-\n]/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "";
  return plain.slice(0, 800);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function pcm16ToAudioBuffer(
  ctx: AudioContext,
  audioBytes: ArrayBuffer,
  sampleRate: number
): AudioBuffer {
  const pcm = new Int16Array(audioBytes);
  const audioBuffer = ctx.createBuffer(1, pcm.length, sampleRate);
  const channel = audioBuffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i += 1) {
    channel[i] = pcm[i] / 32768;
  }
  return audioBuffer;
}

interface UseTtsPlaybackOptions {
  onError: (message: string) => void;
}

export function useTtsPlayback({ onError }: UseTtsPlaybackOptions) {
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsRequestIdRef = useRef(0);
  const ttsAudioCtxRef = useRef<AudioContext | null>(null);
  const ttsScheduledTimeRef = useRef(0);
  const ttsSourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const ttsFinishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsSocketRef = useRef<WebSocket | null>(null);

  const clearTtsFinishTimer = useCallback(() => {
    if (ttsFinishTimerRef.current) {
      clearTimeout(ttsFinishTimerRef.current);
      ttsFinishTimerRef.current = null;
    }
  }, []);

  const stopScheduledSources = useCallback(() => {
    for (const source of ttsSourceNodesRef.current) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // ignore already-ended source
      }
    }
    ttsSourceNodesRef.current.clear();
    ttsScheduledTimeRef.current = 0;
  }, []);

  const stopTtsPlayback = useCallback(() => {
    ttsRequestIdRef.current += 1;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (ttsSocketRef.current) {
      try {
        ttsSocketRef.current.close();
      } catch {
        // ignore
      }
      ttsSocketRef.current = null;
    }
    clearTtsFinishTimer();
    stopScheduledSources();
  }, [clearTtsFinishTimer, stopScheduledSources]);

  const speakByTts = useCallback(
    async (text: string, messageId: string) => {
      if (!text.trim()) return;
      const ttsText = getTtsText(text);
      if (!ttsText) return;

      stopTtsPlayback();
      const requestId = ttsRequestIdRef.current;
      const controller = new AbortController();
      ttsAbortRef.current = controller;

      try {
        const ctx = ttsAudioCtxRef.current ?? getOrCreateAudioContext();
        ttsAudioCtxRef.current = ctx;
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        await new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(buildTtsWsUrl());
          let closedByDone = false;
          let sampleRate = 24000;

          const finishPlaybackLater = () => {
            clearTtsFinishTimer();
            if (ttsScheduledTimeRef.current > ctx.currentTime) {
              const remainingMs = Math.max(
                0,
                Math.ceil((ttsScheduledTimeRef.current - ctx.currentTime) * 1000)
              );
              ttsFinishTimerRef.current = setTimeout(() => {
                ttsScheduledTimeRef.current = 0;
                ttsFinishTimerRef.current = null;
              }, remainingMs + 80);
            } else {
              ttsScheduledTimeRef.current = 0;
            }
          };

          const schedulePcmChunk = (delta: string) => {
            const audioBytes = base64ToArrayBuffer(delta);
            const decoded = pcm16ToAudioBuffer(ctx, audioBytes, sampleRate);
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.connect(ctx.destination);
            source.onended = () => {
              ttsSourceNodesRef.current.delete(source);
            };
            ttsSourceNodesRef.current.add(source);

            const startAt = Math.max(
              ctx.currentTime + 0.02,
              ttsScheduledTimeRef.current || 0
            );
            source.start(startAt);
            ttsScheduledTimeRef.current = startAt + decoded.duration;
          };

          controller.signal.addEventListener(
            "abort",
            () => {
              try {
                ws.close();
              } catch {
                // ignore
              }
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true }
          );

          ws.onopen = () => {
            ttsSocketRef.current = ws;
            ws.send(
              JSON.stringify({
                type: "start",
                text: ttsText,
                voice: "Cherry",
              })
            );
          };

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(String(event.data ?? "{}"));
              if (msg?.type === "started" && Number.isFinite(msg?.sampleRate)) {
                sampleRate = Number(msg.sampleRate) || sampleRate;
                return;
              }
              if (msg?.type === "audio" && typeof msg?.delta === "string") {
                schedulePcmChunk(msg.delta);
                return;
              }
              if (msg?.type === "done") {
                closedByDone = true;
                finishPlaybackLater();
                try {
                  ws.close();
                } catch {
                  // ignore
                }
                resolve();
                return;
              }
              if (msg?.type === "error") {
                reject(new Error(msg?.error || "实时语音播放失败"));
              }
            } catch (err) {
              reject(err instanceof Error ? err : new Error("实时语音播放失败"));
            }
          };

          ws.onerror = () => {
            reject(new Error("实时语音播放失败"));
          };

          ws.onclose = () => {
            if (ttsSocketRef.current === ws) {
              ttsSocketRef.current = null;
            }
            if (!closedByDone && requestId === ttsRequestIdRef.current) {
              finishPlaybackLater();
            }
          };
        });

        void messageId;
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          stopScheduledSources();
          onError((err as Error)?.message || "TTS 播放失败，请稍后重试");
        }
      } finally {
        if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
      }
    },
    [clearTtsFinishTimer, onError, stopScheduledSources, stopTtsPlayback]
  );

  const getTurnAssistantText = useCallback((assistantMessages: any[]) => {
    const raw = assistantMessages
      .map((m) => (typeof m?.content === "string" ? m.content : ""))
      .join(" ")
      .trim();
    return getTtsText(raw);
  }, []);

  const ensureTtsAudioUnlocked = useCallback(async () => {
    try {
      if (!ttsAudioCtxRef.current) {
        ttsAudioCtxRef.current = getOrCreateAudioContext();
      }
      if (ttsAudioCtxRef.current.state === "suspended") {
        await ttsAudioCtxRef.current.resume();
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTtsPlayback();
    };
  }, [stopTtsPlayback]);

  return {
    ensureTtsAudioUnlocked,
    getTurnAssistantText,
    speakByTts,
    stopTtsPlayback,
  };
}
