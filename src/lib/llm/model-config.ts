/**
 * 动态模型配置：优先从 app_settings 读取，否则回退到环境变量
 * 使用 AsyncLocalStorage 实现请求级隔离，无需参数传递
 */
import { AsyncLocalStorage } from "async_hooks";
import { supabaseAdmin } from "@/lib/supabase";

export interface ModelConfig {
  modelChat: string;
  modelLight: string;
  modelAgent: string;
  modelRerank: string;
  modelEmbedding: string;
  embeddingDimensions: number;
  modelAsr: string;
  modelTts: string;
  modelImageGen: string;
  modelVideoGen: string;
}

const DEFAULT_CONFIG: ModelConfig = {
  modelChat: process.env.MODEL_CHAT || "qvq-max-2025-03-25",
  modelLight: process.env.MODEL_LIGHT || "qwen-max",
  modelAgent: process.env.MODEL_AGENT || "qvq-max-2025-03-25",
  modelRerank: process.env.MODEL_RERANK || "qwen3-rerank",
  modelEmbedding: process.env.MODEL_EMBEDDING || "text-embedding-v4",
  embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1024", 10),
  modelAsr: process.env.MODEL_ASR || "qwen3-asr-flash-realtime",
  modelTts: process.env.MODEL_TTS || "qwen3-tts-vd-2026-01-26",
  modelImageGen: process.env.MODEL_IMAGE_GEN || "qwen-image",
  modelVideoGen: process.env.MODEL_VIDEO_GEN || "wanx-v1",
};

const configStore = new AsyncLocalStorage<ModelConfig>();

let cache: ModelConfig | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 30_000; // 30 秒

async function loadFromDb(): Promise<ModelConfig | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "model_config")
      .single();

    if (error || !data?.value) return null;
    const v = data.value as Record<string, unknown>;
    return {
      modelChat: String(v.modelChat ?? DEFAULT_CONFIG.modelChat),
      modelLight: String(v.modelLight ?? DEFAULT_CONFIG.modelLight),
      modelAgent: String(v.modelAgent ?? DEFAULT_CONFIG.modelAgent),
      modelRerank: String(v.modelRerank ?? DEFAULT_CONFIG.modelRerank),
      modelEmbedding: String(v.modelEmbedding ?? DEFAULT_CONFIG.modelEmbedding),
      embeddingDimensions: Number(
        v.embeddingDimensions ?? DEFAULT_CONFIG.embeddingDimensions
      ),
      modelAsr: String(v.modelAsr ?? DEFAULT_CONFIG.modelAsr),
      modelTts: String(v.modelTts ?? DEFAULT_CONFIG.modelTts),
      modelImageGen: String(v.modelImageGen ?? DEFAULT_CONFIG.modelImageGen),
      modelVideoGen: String(v.modelVideoGen ?? DEFAULT_CONFIG.modelVideoGen),
    };
  } catch {
    return null;
  }
}

/** 获取当前模型配置（带缓存） */
export async function getModelConfig(): Promise<ModelConfig> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL_MS) {
    return cache;
  }
  const fromDb = await loadFromDb();
  if (fromDb) {
    cache = fromDb;
    cacheTime = now;
    return fromDb;
  }
  return DEFAULT_CONFIG;
}

/** 同步获取（用于非 async 上下文，使用缓存或默认值） */
export function getModelConfigSync(): ModelConfig {
  if (cache) return cache;
  return DEFAULT_CONFIG;
}

/** 清除缓存（配置更新后调用） */
export function invalidateModelConfigCache(): void {
  cache = null;
}

/**
 * 在指定配置的上下文中执行回调（请求入口调用）
 * 内部所有 getModelChat() 等会读取此 config
 */
export function runWithConfig<T>(config: ModelConfig, fn: () => T): T {
  return configStore.run(config, fn);
}

/** 异步版本 */
export async function runWithConfigAsync<T>(
  config: ModelConfig,
  fn: () => Promise<T>
): Promise<T> {
  return configStore.run(config, fn);
}

/** 同步 getter：从请求上下文或默认值读取 */
function getStore(): ModelConfig {
  return configStore.getStore() ?? DEFAULT_CONFIG;
}

export const getModelChat = () => getStore().modelChat;
export const getModelLight = () => getStore().modelLight;
export const getModelAgent = () => getStore().modelAgent;
export const getModelRerank = () => getStore().modelRerank;
export const getModelEmbedding = () => getStore().modelEmbedding;
export const getEmbeddingDimensions = () => getStore().embeddingDimensions;

/** 保存模型配置到数据库 */
export async function saveModelConfig(config: ModelConfig): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        key: "model_config",
        value: config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) return false;
    invalidateModelConfigCache();
    return true;
  } catch {
    return false;
  }
}
