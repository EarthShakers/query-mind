import { PREAMBLE_SILENCE_SAMPLES } from "@/lib/voice/voice-input-constants";
import type { AsrTransport } from "@/lib/voice/asr-transport";

type Ref<T> = { current: T };

/** 将缓冲的 PCM 块合并推送到 transport（含首包静音 preamble） */
export function flushPcmChunkBuffer(
  transport: AsrTransport,
  chunksRef: Ref<Int16Array[]>,
  preambleSentRef: Ref<boolean>
): void {
  if (chunksRef.current.length === 0) return;
  if (!preambleSentRef.current) {
    transport.pushAudio(new Int16Array(PREAMBLE_SILENCE_SAMPLES).buffer);
    preambleSentRef.current = true;
  }
  const pending = chunksRef.current;
  chunksRef.current = [];
  const totalLen = pending.reduce((s, c) => s + c.length, 0);
  const merged = new Int16Array(totalLen);
  let off = 0;
  for (const c of pending) {
    merged.set(c, off);
    off += c.length;
  }
  transport.pushAudio(merged.buffer);
}
