/**
 * PCM 预处理：门限降噪 + 简易 AGC，输出供 ASR 的 16bit 线性 PCM。
 */

/** 会话开始时对底噪能量的初始估计（Int16 幅度尺度） */
export const DENOISE_FLOOR_DEFAULT = 120;
/** AGC 平滑后的起始增益 */
export const AGC_GAIN_DEFAULT = 1;
/** AGC 期望拉到的 RMS 水平（Int16 域） */
export const AGC_TARGET_RMS = 3200;

/** 计算整段 PCM 的 RMS（均方根） */
export function pcmRms(pcm: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length);
}

/**
 * 门限以下样本衰减 + 一阶平滑 AGC；返回新 PCM 与更新后的噪声底、增益状态。
 */
export function preprocessPcm(
  pcm: Int16Array,
  noiseFloor: number,
  prevGain: number
): { pcm: Int16Array; noiseFloor: number; gain: number } {
  let absSum = 0;
  for (let i = 0; i < pcm.length; i++) absSum += Math.abs(pcm[i]);
  const avgAbs = absSum / pcm.length;

  const boundedAvg = Math.min(avgAbs, noiseFloor * 1.6 + 80);
  const nextNoiseFloor = Math.max(
    60,
    Math.min(2200, noiseFloor * 0.92 + boundedAvg * 0.08)
  );
  const gate = Math.max(60, Math.min(1200, nextNoiseFloor * 1.2));
  const attenuate = 0.7;

  const denoised = new Int16Array(pcm.length);
  let sumSq = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i];
    const av = Math.abs(v);
    let out = v;
    if (av < gate) {
      out = Math.round(v * attenuate);
    }
    denoised[i] = out;
    sumSq += out * out;
  }

  const rms = Math.sqrt(sumSq / Math.max(1, denoised.length));
  const desiredGain =
    rms > 1 ? Math.max(0.8, Math.min(16, AGC_TARGET_RMS / rms)) : prevGain;
  const nextGain = prevGain * 0.65 + desiredGain * 0.35;

  const normalized = new Int16Array(denoised.length);
  for (let i = 0; i < denoised.length; i++) {
    const scaled = Math.round(denoised[i] * nextGain);
    normalized[i] = Math.max(-0x8000, Math.min(0x7fff, scaled));
  }

  return { pcm: normalized, noiseFloor: nextNoiseFloor, gain: nextGain };
}
