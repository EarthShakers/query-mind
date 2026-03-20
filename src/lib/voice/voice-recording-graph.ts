import { INPUT_PREAMP_GAIN } from "@/lib/voice/voice-input-constants";

export interface VoiceRecordingGraphNodes {
  source: MediaStreamAudioSourceNode;
  preamp: GainNode;
  recordDest: MediaStreamAudioDestinationNode;
  analyser: AnalyserNode;
  silentGain: GainNode;
}

/** 源 → 分析器（电平）+ 前级 → 录音目标轨 */
export function connectVoiceRecordingGraph(
  audioCtx: AudioContext,
  stream: MediaStream
): VoiceRecordingGraphNodes {
  const source = audioCtx.createMediaStreamSource(stream);
  const preamp = audioCtx.createGain();
  preamp.gain.value = INPUT_PREAMP_GAIN;
  const recordDest = audioCtx.createMediaStreamDestination();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.5;
  source.connect(analyser);
  source.connect(preamp);
  preamp.connect(recordDest);
  const silentGain = audioCtx.createGain();
  silentGain.gain.value = 0.0001;
  analyser.connect(silentGain);
  silentGain.connect(audioCtx.destination);
  return { source, preamp, recordDest, analyser, silentGain };
}

/** 返回 cancel()：置 stopped 并 cancel 当前帧，避免链式 raf 泄漏 */
export function startAnalyserLevelLoop(
  analyser: AnalyserNode,
  onLevelChange: (level: number) => void
): () => void {
  const dataArr = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    analyser.getByteFrequencyData(dataArr);
    const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length;
    onLevelChange(Math.min(1, avg / 128));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
