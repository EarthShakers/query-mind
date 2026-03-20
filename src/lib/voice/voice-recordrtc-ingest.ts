import { preprocessPcm, pcmRms } from "@/lib/voice/pcm-preprocess";
import { parseWavToPcm, resampleTo16k } from "@/lib/voice/wav-pcm";
import {
  CLIENT_VAD_PAUSE_ENABLED,
  MAX_CHUNKS_BUFFERED,
  RAW_VAD_RMS_THRESHOLD,
  VAD_RMS_THRESHOLD,
  VAD_SILENT_CHUNKS,
} from "@/lib/voice/voice-input-constants";

/*
 * RecordRTC 输出的 WAV 分片 → 与 ASR 对齐的 16k PCM 流水线。
 */

type Ref<T> = { current: T };

/** RecordRTC 分片处理所需的 ref 集合（与 React hook 共享可变状态） */
export interface VoicePcmPipelineRefs {
  chunksRef: Ref<Int16Array[]>;
  denoiseFloorRef: Ref<number>;
  agcGainRef: Ref<number>;
  vadSilentCountRef: Ref<number>;
  vadPausedRef: Ref<boolean>;
}

/**
 * RecordRTC `ondataavailable` 回调体：解析 WAV → 统一 16kHz → 降噪/AGC →
 * 可选客户端 VAD 暂停 → 写入 `chunksRef` 供定时 flush。
 */
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
