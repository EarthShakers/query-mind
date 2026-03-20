import { PREAMBLE_SILENCE_SAMPLES } from "@/lib/voice/voice-input-constants";
import type { AsrTransport } from "@/lib/voice/asr-transport";

/*
 * 定时器触发的 PCM 缓冲 flush：合并小块、首包补静音，降低对网关的 send 次数。
 */

/** 与 React useRef 同形的可变引用，便于纯函数接收 ref */
type Ref<T> = { current: T };

/**
 * 将环形缓冲中的 PCM 块合并为一块后 `pushAudio`；
 * 首次发送前会附带一段静音 preamble，便于服务端 VAD/端点。
 */
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
