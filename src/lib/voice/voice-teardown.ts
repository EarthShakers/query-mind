import { resetSharedAudioContextSingleton } from "@/lib/voice/browser-audio";
import type { AsrTransport } from "@/lib/voice/asr-transport";
import { AGC_GAIN_DEFAULT, DENOISE_FLOOR_DEFAULT } from "@/lib/voice/pcm-preprocess";

/*
 * 统一释放麦克风流、音频节点、定时器与可选 ASR transport，避免 hook 内重复代码。
 */

type Ref<T> = { current: T };

/** RecordRTC 实例上我们实际调用的最小接口 */
export type VoiceRecorderRef = {
  startRecording: () => void;
  stopRecording: () => void;
};

/**
 * `useVoiceInput` 持有的全部会话 ref，供单次 teardown 统一清理，
 * 避免 `cleanup` / `cleanupRecordingOnly` 复制粘贴。
 */
export interface VoiceSessionRefs {
  pushIntervalRef: Ref<ReturnType<typeof setInterval> | null>;
  levelLoopCancelRef: Ref<(() => void) | null>;
  sourceNodeRef: Ref<MediaStreamAudioSourceNode | null>;
  preampGainRef: Ref<GainNode | null>;
  recordDestRef: Ref<MediaStreamAudioDestinationNode | null>;
  analyserRef: Ref<AnalyserNode | null>;
  silentGainRef: Ref<GainNode | null>;
  recorderRef: Ref<VoiceRecorderRef | null>;
  audioCtxRef: Ref<AudioContext | null>;
  mediaStreamRef: Ref<MediaStream | null>;
  transportRef: Ref<AsrTransport | null>;
  transportPromiseRef: Ref<Promise<AsrTransport> | null>;
  vadSilentCountRef: Ref<number>;
  vadPausedRef: Ref<boolean>;
  preambleSentRef: Ref<boolean>;
  denoiseFloorRef: Ref<number>;
  agcGainRef: Ref<number>;
  hasPartialRef: Ref<boolean>;
  lastPartialRef: Ref<string>;
}

/**
 * 结束一轮语音会话：停定时器、停电平 rAF、拆音频图、停轨、关上下文、可选关 ASR。
 * @param opts.closeTransport 为 true 时同时 `transport.close()` 并清空 transport 相关 ref（取消录音场景）；
 *                            为 false 时保留 transport，供 stop 后继续 `stop()` 拉取终稿。
 */
export function teardownVoiceSession(
  refs: VoiceSessionRefs,
  opts: { closeTransport: boolean; zeroLevel?: () => void }
): void {
  opts.zeroLevel?.();
  if (refs.pushIntervalRef.current) {
    clearInterval(refs.pushIntervalRef.current);
    refs.pushIntervalRef.current = null;
  }
  if (refs.levelLoopCancelRef.current) {
    refs.levelLoopCancelRef.current();
    refs.levelLoopCancelRef.current = null;
  }
  refs.sourceNodeRef.current?.disconnect();
  refs.sourceNodeRef.current = null;
  refs.preampGainRef.current?.disconnect();
  refs.preampGainRef.current = null;
  refs.recordDestRef.current?.disconnect();
  refs.recordDestRef.current = null;
  refs.analyserRef.current?.disconnect();
  refs.analyserRef.current = null;
  refs.silentGainRef.current?.disconnect();
  refs.silentGainRef.current = null;
  if (refs.recorderRef.current) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try {
      (refs.recorderRef.current as any).destroy?.();
    } catch {
      /* ignore */
    }
    refs.recorderRef.current = null;
  }
  if (refs.audioCtxRef.current) {
    try {
      refs.audioCtxRef.current.close();
    } catch {
      /* ignore */
    }
    refs.audioCtxRef.current = null;
    resetSharedAudioContextSingleton();
  }
  refs.mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
  refs.mediaStreamRef.current = null;
  if (opts.closeTransport) {
    refs.transportRef.current?.close();
    refs.transportRef.current = null;
    refs.transportPromiseRef.current = null;
  }
  refs.vadSilentCountRef.current = 0;
  refs.vadPausedRef.current = false;
  refs.preambleSentRef.current = false;
  refs.denoiseFloorRef.current = DENOISE_FLOOR_DEFAULT;
  refs.agcGainRef.current = AGC_GAIN_DEFAULT;
  refs.hasPartialRef.current = false;
  refs.lastPartialRef.current = "";
}
