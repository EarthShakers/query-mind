/**
 * AudioWorklet 处理器：将 Float32 音频采样转为 Int16 PCM
 * 采样率由 AudioContext({ sampleRate: 16000 }) 控制
 */
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0][0]; // mono channel
    if (!input) return true;

    const int16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
