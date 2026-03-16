const LEVEL_INTERVAL = 1 / 60; // 约 60fps 上报音量

/**
 * 从 inputs 获取单声道 Float32 数据，兼容多声道（取第一声道或混音）
 */
function getMonoInput(inputs) {
  const bus = inputs[0];
  if (!bus || bus.length === 0) return null;
  const ch0 = bus[0];
  if (!ch0 || ch0.length === 0) return null;
  if (bus.length === 1) return ch0;
  // 多声道：混音到单声道
  const merged = new Float32Array(ch0.length);
  for (let c = 0; c < bus.length; c++) {
    const ch = bus[c];
    if (!ch) continue;
    for (let i = 0; i < Math.min(ch.length, merged.length); i++) {
      merged[i] += ch[i];
    }
  }
  for (let i = 0; i < merged.length; i++) {
    merged[i] /= bus.length;
  }
  return merged;
}

/**
 * AudioWorklet 处理器：Float32 → 16kHz Int16 PCM
 * 接收主线程传入的原生采样率，自动降采样到 16kHz
 * 同时计算 RMS 音量并通过 postMessage({ type:'level', value }) 上报
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._nativeRate = options.processorOptions?.sampleRate || sampleRate;
    this._ratio = this._nativeRate / 16000;
    this._resampleOffset = 0;
    this._lastLevelTime = currentTime;
    this._smoothedLevel = 0;
  }

  _postLevel(input) {
    if (!input || input.length === 0) return;
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      sum += input[i] * input[i];
    }
    const rms = Math.sqrt(sum / input.length);
    this._smoothedLevel = Math.max(rms, this._smoothedLevel * 0.8);
    this.port.postMessage({ type: "level", value: this._smoothedLevel });
    this._lastLevelTime = currentTime;
  }

  process(inputs, outputs) {
    const input = getMonoInput(inputs);
    if (!input) return true;

    if (currentTime - this._lastLevelTime >= LEVEL_INTERVAL) {
      this._postLevel(input);
    }

    if (this._ratio <= 1) {
      // 原生就是 16kHz 或更低，直接转换
      const int16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(int16.buffer, [int16.buffer]);
    } else {
      // 降采样：从高采样率 pick 样本
      const outLen = Math.floor((input.length + this._resampleOffset) / this._ratio);
      if (outLen <= 0) {
        this._resampleOffset += input.length;
        return true;
      }
      const int16 = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const srcIdx = Math.floor(i * this._ratio - this._resampleOffset);
        const idx = Math.max(0, Math.min(input.length - 1, srcIdx));
        const s = Math.max(-1, Math.min(1, input[idx]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this._resampleOffset = (this._resampleOffset + input.length) - outLen * this._ratio;
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
