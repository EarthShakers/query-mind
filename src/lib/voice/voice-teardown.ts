import { resetSharedAudioContextSingleton } from "@/lib/voice/browser-audio";
import type { AsrTransport } from "@/lib/voice/asr-transport";
import { AGC_GAIN_DEFAULT, DENOISE_FLOOR_DEFAULT } from "@/lib/voice/pcm-preprocess";

type Ref<T> = { current: T };

export type VoiceRecorderRef = {
  startRecording: () => void;
  stopRecording: () => void;
};

/** useVoiceInput 内各 ref 的聚合，便于一处 teardown、消灭 cleanup 重复 */
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
