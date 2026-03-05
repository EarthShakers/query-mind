-- Self-Query / 元数据索引迁移
-- 在 Supabase SQL Editor 中执行（需先执行 supabase-setup.sql）
-- 执行后，聊天检索将支持自然语言中的文档限定，如「产品手册里的保修期」「XX.pdf 中的安装步骤」

-- 1. 添加 space_id、tenant_id 列（若不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'space_id') THEN
    ALTER TABLE documents ADD COLUMN space_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'tenant_id') THEN
    ALTER TABLE documents ADD COLUMN tenant_id UUID;
  END IF;
END $$;

-- 2. metadata JSONB GIN 索引（加速 metadata 过滤）
CREATE INDEX IF NOT EXISTS documents_metadata_gin_idx ON documents USING gin (metadata jsonb_path_ops);

-- 3. space_id 索引（加速空间过滤）
CREATE INDEX IF NOT EXISTS documents_space_id_idx ON documents (space_id) WHERE space_id IS NOT NULL;

-- 4. 更新 match_documents：支持 filter_spaces、filter_title
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1024),
  match_count INT DEFAULT 3,
  filter_spaces UUID[] DEFAULT NULL,
  filter_title TEXT DEFAULT NULL
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
  WHERE
    (
      filter_spaces IS NULL
      OR array_length(filter_spaces, 1) IS NULL
      OR d.space_id = ANY(filter_spaces)
    )
    AND (
      filter_title IS NULL
      OR trim(filter_title) = ''
      OR d.title ILIKE '%' || trim(filter_title) || '%'
    )
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
