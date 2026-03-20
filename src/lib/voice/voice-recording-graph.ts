import { INPUT_PREAMP_GAIN } from "@/lib/voice/voice-input-constants";

/*
 * Web Audio 录音子图：一路电平、一路进 RecordRTC。
 */

/** `connectVoiceRecordingGraph` 创建的节点句柄，供 teardown 时 disconnect */
export interface VoiceRecordingGraphNodes {
  /** 麦克风 MediaStream 源节点 */
  source: MediaStreamAudioSourceNode;
  /** 数字前级增益（提高 RecordRTC 输入电平） */
  preamp: GainNode;
  /** 供 RecordRTC 录制的目标 MediaStream */
  recordDest: MediaStreamAudioDestinationNode;
  /** 频域数据供电平条使用 */
  analyser: AnalyserNode;
  /** 极小增益接 destination，避免部分浏览器 suspend 图导致 analyser 不工作 */
  silentGain: GainNode;
}

/**
 * 搭建录音用 Web Audio 子图：一路给 analyser 做电平，一路经 preamp 进 recordDest。
 */
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

/**
 * 用 `getByteFrequencyData` 驱动 `onLevelChange(0~1)`；
 * 返回的函数需在下麦时调用，以停止 rAF 链。
 */
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
