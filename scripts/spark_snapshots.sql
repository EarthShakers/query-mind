-- Run in Supabase SQL Editor (once per project).
-- Spark CLI / 游戏生成器：将本地项目文件快照存到云端（需 Next 端配置 SUPABASE_SERVICE_ROLE_KEY）。

create table if not exists public.spark_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  slug text not null default 'default',
  files jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists spark_snapshots_user_updated_idx
  on public.spark_snapshots (user_id, updated_at desc);

comment on table public.spark_snapshots is 'Spark game generator: per-user file snapshots from CLI';
