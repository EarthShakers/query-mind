-- Run after scripts/spark_snapshots.sql
-- 为 Spark 游戏快照补充公开展示所需元数据。

alter table public.spark_snapshots
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists cover_url text,
  add column if not exists is_public boolean not null default true;

update public.spark_snapshots
set title = initcap(replace(replace(slug, '-', ' '), '_', ' '))
where title is null or btrim(title) = '';

create index if not exists spark_snapshots_public_updated_idx
  on public.spark_snapshots (is_public, updated_at desc);

comment on column public.spark_snapshots.title is '公开展示时使用的游戏标题';
comment on column public.spark_snapshots.description is '公开展示时使用的游戏简介';
comment on column public.spark_snapshots.cover_url is '公开展示时使用的封面图片 URL';
comment on column public.spark_snapshots.is_public is '是否在公开游戏列表中展示';
