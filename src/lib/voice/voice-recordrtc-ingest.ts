import { preprocessPcm, pcmRms } from "@/lib/voice/pcm-preprocess";
import { parseWavToPcm, resampleTo16k } from "@/lib/voice/wav-pcm";
import {
  CLIENT_VAD_PAUSE_ENABLED,
  MAX_CHUNKS_BUFFERED,
  RAW_VAD_RMS_THRESHOLD,
  VAD_RMS_THRESHOLD,
  VAD_SILENT_CHUNKS,
} from "@/lib/voice/voice-input-constants";

type Ref<T> = { current: T };

export interface VoicePcmPipelineRefs {
  chunksRef: Ref<Int16Array[]>;
  denoiseFloorRef: Ref<number>;
  agcGainRef: Ref<number>;
  vadSilentCountRef: Ref<number>;
  vadPausedRef: Ref<boolean>;
}

/** RecordRTC ondataavailable：WAV → 16k PCM → 预处理 → VAD 缓冲 */
export async function ingestRecordRtcWavBlob(
  blob: Blob,
  refs: VoicePcmPipelineRefs
): Promise<void> {
  if (!blob || blob.size < 44) return;
  const parsed = await parseWavToPcm(blob);
  if (!parsed) return;
  const pcm =
    parsed.sampleRate === 16000
      ? parsed.pcm
      : resampleTo16k(parsed.pcm, parsed.sampleRate);
  if (pcm.length === 0) return;
  const processed = preprocessPcm(
    pcm,
    refs.denoiseFloorRef.current,
    refs.agcGainRef.current
  );
  refs.denoiseFloorRef.current = processed.noiseFloor;
  refs.agcGainRef.current = processed.gain;
  const processedPcm = processed.pcm;

  if (CLIENT_VAD_PAUSE_ENABLED) {
    const rms = pcmRms(processedPcm);
    const rawRms = pcmRms(pcm);
    if (rms < VAD_RMS_THRESHOLD && rawRms < RAW_VAD_RMS_THRESHOLD) {
      refs.vadSilentCountRef.current += 1;
      if (refs.vadSilentCountRef.current >= VAD_SILENT_CHUNKS) {
        refs.vadPausedRef.current = true;
      }
    } else {
      refs.vadSilentCountRef.current = 0;
      refs.vadPausedRef.current = false;
    }
  } else {
    refs.vadSilentCountRef.current = 0;
    refs.vadPausedRef.current = false;
  }

  if (!refs.vadPausedRef.current) {
    const chunks = refs.chunksRef.current;
    if (chunks.length >= MAX_CHUNKS_BUFFERED) chunks.shift();
    chunks.push(processedPcm);
  }
}
