/** 内存保护：chunks 堆积上限 */
export const MAX_CHUNKS_BUFFERED = 60;
export const CHUNK_INTERVAL_MS = 100;
export const VAD_SILENT_MS = 1500;
export const VAD_SILENT_CHUNKS = Math.ceil(VAD_SILENT_MS / CHUNK_INTERVAL_MS);
export const VAD_RMS_THRESHOLD = 180;
export const RAW_VAD_RMS_THRESHOLD = 90;
export const PREAMBLE_SILENCE_SAMPLES = 3200;
export const CLIENT_VAD_PAUSE_ENABLED = false;
export const INPUT_PREAMP_GAIN = 4.5;
