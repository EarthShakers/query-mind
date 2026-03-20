"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useAsrWsChannel } from "@/contexts/asr-ws-context";
import {
  getOrCreateAudioContext,
  getRecordRTC,
} from "@/lib/voice/browser-audio";
import { CHUNK_INTERVAL_MS } from "@/lib/voice/voice-input-constants";
import {
  AGC_GAIN_DEFAULT,
  DENOISE_FLOOR_DEFAULT,
} from "@/lib/voice/pcm-preprocess";
import type { AsrTransport } from "@/lib/voice/asr-transport";
import { flushPcmChunkBuffer } from "@/lib/voice/voice-chunk-flush";
import {
  isAbortLikeError,
  messageForRecordingStartFailure,
} from "@/lib/voice/voice-errors";
import { ingestRecordRtcWavBlob } from "@/lib/voice/voice-recordrtc-ingest";
import {
  connectVoiceRecordingGraph,
  startAnalyserLevelLoop,
} from "@/lib/voice/voice-recording-graph";
import { requestMicStreamWithFallback } from "@/lib/voice/voice-mic";
import { openAsrTransportWithFallback } from "@/lib/voice/open-asr-transport";
import {
  teardownVoiceSession,
  type VoiceSessionRefs,
} from "@/lib/voice/voice-teardown";
import {
  finalizeVoiceTranscript,
  handleFinalizeVoiceError,
} from "@/lib/voice/voice-transcript-finalize";

export interface UseVoiceInputOptions {
  onResult: (text: string) => void;
  onCorrected?: (text: string, sourceText?: string) => void;
  onPartial?: (text: string) => void;
  onError?: (message: string) => void;
  onLevelChange?: (level: number) => void;
}

export function useVoiceInput({
  onResult,
  onCorrected,
  onPartial,
  onError,
  onLevelChange,
}: UseVoiceInputOptions) {
  const asrChannel = useAsrWsChannel();
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
  const preampGainRef = useRef<GainNode | null>(null);
  const recordDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const levelLoopCancelRef = useRef<(() => void) | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const transportRef = useRef<AsrTransport | null>(null);
  const transportPromiseRef = useRef<Promise<AsrTransport> | null>(null);
  const pushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const hasResultRef = useRef(false);
  const abortRef = useRef(false);
  const vadSilentCountRef = useRef(0);
  const vadPausedRef = useRef(false);
  const preambleSentRef = useRef(false);
  const denoiseFloorRef = useRef(DENOISE_FLOOR_DEFAULT);
  const agcGainRef = useRef(AGC_GAIN_DEFAULT);
  const hasPartialRef = useRef(false);
  const lastPartialRef = useRef("");

  /** 聚合 ref，避免 teardown 参数漏传 */
  const sessionRefs = useMemo<VoiceSessionRefs>(
    () => ({
      pushIntervalRef,
      levelLoopCancelRef,
      sourceNodeRef,
      preampGainRef,
      recordDestRef,
      analyserRef,
      silentGainRef,
      recorderRef,
      audioCtxRef,
      mediaStreamRef,
      transportRef,
      transportPromiseRef,
      vadSilentCountRef,
      vadPausedRef,
      preambleSentRef,
      denoiseFloorRef,
      agcGainRef,
      hasPartialRef,
      lastPartialRef,
    }),
    []
  );

  const cleanup = useCallback(() => {
    teardownVoiceSession(sessionRefs, {
      closeTransport: true,
      zeroLevel: () => onLevelChange?.(0),
    });
  }, [sessionRefs, onLevelChange]);

  const cleanupRecordingOnly = useCallback(() => {
    teardownVoiceSession(sessionRefs, {
      closeTransport: false,
      zeroLevel: () => onLevelChange?.(0),
    });
  }, [sessionRefs, onLevelChange]);

  const flushChunks = useCallback(() => {
    const transport = transportRef.current;
    if (!transport || chunksRef.current.length === 0) return;
    flushPcmChunkBuffer(transport, chunksRef, preambleSentRef);
  }, []);

  const pcmPipelineRefs = useMemo(
    () => ({
      chunksRef,
      denoiseFloorRef,
      agcGainRef,
      vadSilentCountRef,
      vadPausedRef,
    }),
    []
  );

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    hasResultRef.current = false;
    abortRef.current = false;
    vadSilentCountRef.current = 0;
    vadPausedRef.current = false;
    preambleSentRef.current = false;
    denoiseFloorRef.current = DENOISE_FLOOR_DEFAULT;
    agcGainRef.current = AGC_GAIN_DEFAULT;
    hasPartialRef.current = false;
    lastPartialRef.current = "";

    try {
      if (abortRef.current) return;
      setIsRecording(true);

      const transportHandlers = {
        onPartial: (text: string) => {
          if (text) {
            hasPartialRef.current = true;
            lastPartialRef.current = text;
            onPartial?.(text);
          }
        },
        onText: (text: string) => {
          if (text) {
            hasResultRef.current = true;
            setIsTranscribing(false);
          }
        },
        onCorrected: (text: string, sourceText?: string) => {
          if (text) onCorrected?.(text, sourceText);
        },
        onError: (msg: string) => {
          if (/aborted|abort/i.test(msg)) return;
          onError?.(msg);
          setIsTranscribing(false);
        },
        onDone: () => {
          setIsTranscribing(false);
        },
      };

      const transportPromise = openAsrTransportWithFallback(
        asrChannel,
        transportHandlers
      );

      const [stream, RecordRTCModule] = await Promise.all([
        requestMicStreamWithFallback(),
        getRecordRTC(),
      ]);
      if (abortRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        cleanup();
        setIsRecording(false);
        return;
      }
      mediaStreamRef.current = stream;

      const audioCtx = getOrCreateAudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();

      const graph = connectVoiceRecordingGraph(audioCtx, stream);
      sourceNodeRef.current = graph.source;
      preampGainRef.current = graph.preamp;
      recordDestRef.current = graph.recordDest;
      analyserRef.current = graph.analyser;
      silentGainRef.current = graph.silentGain;

      levelLoopCancelRef.current = startAnalyserLevelLoop(
        graph.analyser,
        (level) => onLevelChange?.(level)
      );

      const recorderStream = recordDestRef.current?.stream?.getAudioTracks()
        ?.length
        ? recordDestRef.current.stream
        : stream;
      const recorder = new RecordRTCModule(recorderStream, {
        type: "audio",
        mimeType: "audio/wav",
        recorderType: (RecordRTCModule as { StereoAudioRecorder: unknown })
          .StereoAudioRecorder as import("recordrtc").Recorder,
        timeSlice: 120,
        desiredSampRate: 16000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        disableLogs: true,
        ondataavailable: (blob: Blob) => {
          void ingestRecordRtcWavBlob(blob, pcmPipelineRefs);
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

      pushIntervalRef.current = setInterval(flushChunks, CHUNK_INTERVAL_MS);
      transportPromiseRef.current = transportPromise;
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
      onError?.(messageForRecordingStartFailure(err));
      setError(null);
    }
  }, [
    asrChannel,
    cleanup,
    flushChunks,
    onCorrected,
    onPartial,
    onError,
    onLevelChange,
    pcmPipelineRefs,
  ]);

  const stopRecording = useCallback(async () => {
    abortRef.current = true;
    setIsRecording(false);

    let transport = transportRef.current;
    if (!transport) {
      if (transportPromiseRef.current) {
        try {
          const t = await transportPromiseRef.current;
          transportRef.current = t;
          transport = t;
        } catch {
          onError?.("连接失败，请重试");
          return;
        }
      } else {
        onError?.("连接未就绪，请重试");
        return;
      }
    }

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
    const savedPartial = lastPartialRef.current?.trim();
    const hadPartial = hasPartialRef.current;
    cleanupRecordingOnly();

    await new Promise((r) => setTimeout(r, 50));
    flushChunks();

    try {
      const finalTransport = transportRef.current!;
      const transcript = await finalTransport.stop();
      await finalizeVoiceTranscript({
        transcript,
        hasResultRef,
        savedPartial,
        hadPartial,
        onResult,
        onError,
      });
    } catch (err) {
      handleFinalizeVoiceError({
        err,
        hasResultRef,
        savedPartial,
        onResult,
        onError,
      });
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
