-- 在 Supabase SQL Editor 中执行
-- 用于支持 Excel/CSV 数据上传功能

-- 1. 数据表元数据
CREATE TABLE IF NOT EXISTS data_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  table_name TEXT NOT NULL UNIQUE,       -- 实际 PG 表名: ud_<8位>
  display_name TEXT NOT NULL,            -- 用户可见名（来自文件名）
  description TEXT,                      -- AI 生成的表描述
  row_count INTEGER DEFAULT 0,
  file_name TEXT,                        -- 原始文件名
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_tables_space ON data_tables(space_id);

-- 2. 列元数据
CREATE TABLE IF NOT EXISTS data_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_table_id UUID NOT NULL REFERENCES data_tables(id) ON DELETE CASCADE,
  column_name TEXT NOT NULL,             -- 实际 PG 列名（英文/下划线）
  display_name TEXT NOT NULL,            -- 原始 Excel 列头
  data_type TEXT NOT NULL DEFAULT 'TEXT', -- TEXT, INTEGER, REAL, DATE
  description TEXT,                      -- AI 生成的列描述
  ordinal INTEGER NOT NULL               -- 列顺序
);

CREATE INDEX IF NOT EXISTS idx_data_columns_table ON data_columns(data_table_id);
