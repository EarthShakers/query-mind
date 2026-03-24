-- 在 Supabase SQL Editor 中执行
-- 用于存储应用级配置（如模型配置）

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认模型配置（可选，首次运行后由页面保存时会自动创建）
-- INSERT INTO app_settings (key, value)
-- VALUES ('model_config', '{"modelChat":"qvq-max-2025-03-25","modelLight":"qwen-max","modelAgent":"qvq-max-2025-03-25","modelRerank":"qwen3-rerank","modelEmbedding":"text-embedding-v4","embeddingDimensions":1024}'::jsonb)
-- ON CONFLICT (key) DO NOTHING;
