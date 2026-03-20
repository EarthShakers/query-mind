/*
 * WAV（RIFF）解析与 PCM 重采样，对接 16kHz ASR 上行。
 */

/**
 * 解析 RecordRTC 产出的 WAV（RIFF）为 Int16 PCM 与 `sampleRate`；
 * 会查找 `data` 子块以兼容非标准 44 字节头。
 */
export async function parseWavToPcm(
  blob: Blob
): Promise<{ pcm: Int16Array; sampleRate: number } | null> {
  const ab = await blob.arrayBuffer();
  const view = new DataView(ab);
  if (ab.byteLength < 44) return null;
  if (
    String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    ) !== "RIFF"
  )
    return null;
  const sampleRate = view.getUint32(24, true);
  let dataOffset = 44;
  let dataSize = ab.byteLength - 44;
  for (let i = 12; i < ab.byteLength - 8; i++) {
    if (
      String.fromCharCode(
        view.getUint8(i),
        view.getUint8(i + 1),
        view.getUint8(i + 2),
        view.getUint8(i + 3)
      ) === "data"
    ) {
      dataOffset = i + 8;
      dataSize = view.getUint32(i + 4, true);
      break;
    }
  }
  if (dataSize <= 0) return null;
  const pcmBytes = ab.slice(dataOffset, dataOffset + dataSize);
  const pcm = new Int16Array(pcmBytes);
  return { pcm, sampleRate };
}

/**
 * 将高于 16kHz 的 Int16 PCM 线性插值降采样到 16kHz；已是低采样率则原样返回。
 */
export function resampleTo16k(pcm: Int16Array, fromRate: number): Int16Array {
  if (fromRate <= 16000) return pcm;
  const ratio = fromRate / 16000;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    const a = pcm[Math.min(srcIdx, pcm.length - 1)];
    const b = pcm[Math.min(srcIdx + 1, pcm.length - 1)];
    out[i] = Math.max(
      -0x8000,
      Math.min(0x7fff, Math.round(a + (b - a) * frac))
    );
  }
  return out;
}
