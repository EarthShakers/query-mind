-- 在 Supabase SQL Editor 中执行以下语句

-- 1. 启用向量扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 创建文档表
CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1024),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 创建向量索引（加速相似度搜索）
CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. 创建相似度搜索函数（供 Supabase RPC 调用）
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1024),
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.content,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
