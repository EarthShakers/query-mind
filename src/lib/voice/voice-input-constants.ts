/**
 * 语音采集与上行相关的可调常量（与 RecordRTC 分片、VAD、前级增益等配合）。
 */

/** 内存保护：环形缓冲中最多保留的 PCM 块数量，防止长时间静音仍堆积 */
export const MAX_CHUNKS_BUFFERED = 60;
/** 定时将缓冲 PCM flush 到 ASR 的间隔（毫秒） */
export const CHUNK_INTERVAL_MS = 100;
/** 客户端 VAD：连续静音超过该时长（毫秒）则暂停向缓冲塞数据 */
export const VAD_SILENT_MS = 1500;
/** 与 CHUNK_INTERVAL_MS 对齐的「静音块」个数上限 */
export const VAD_SILENT_CHUNKS = Math.ceil(VAD_SILENT_MS / CHUNK_INTERVAL_MS);
/** 预处理后的 PCM 低于该 RMS（Int16 域）视为静音倾向 */
export const VAD_RMS_THRESHOLD = 180;
/** 原始 PCM 的 RMS 阈值，与 VAD_RMS_THRESHOLD 双条件避免误切 */
export const RAW_VAD_RMS_THRESHOLD = 90;
/** 首包前附加的静音样本数（16kHz），利于部分 ASR 端点检测语音起点 */
export const PREAMBLE_SILENCE_SAMPLES = 3200;
/** 是否启用上述客户端 VAD 暂停推流（关闭则始终缓冲） */
export const CLIENT_VAD_PAUSE_ENABLED = false;
/** 麦克风源进入 RecordRTC 前的数字增益（线性） */
export const INPUT_PREAMP_GAIN = 4.5;
