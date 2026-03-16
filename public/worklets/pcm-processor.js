/**
 * AudioWorklet 处理器：Float32 → 16kHz Int16 PCM
 * 接收主线程传入的原生采样率，自动降采样到 16kHz
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._nativeRate = options.processorOptions?.sampleRate || sampleRate;
    this._ratio = this._nativeRate / 16000;
    // 累积小数部分，避免采样漂移
    this._resampleOffset = 0;
  }

  process(inputs) {
    const input = inputs[0][0]; // mono channel
    if (!input) return true;

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
