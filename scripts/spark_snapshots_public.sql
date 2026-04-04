-- Run after scripts/spark_snapshots.sql
-- 为 Spark 游戏快照补充公开展示所需元数据。

alter table public.spark_snapshots
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists cover_url text,
  add column if not exists is_public boolean not null default true,
  add column if not exists review_status text not null default 'pending',
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

update public.spark_snapshots
set title = initcap(replace(replace(slug, '-', ' '), '_', ' '))
where title is null or btrim(title) = '';

-- 兼容历史数据：旧版本没有审核流程，默认视作已通过
update public.spark_snapshots
set review_status = 'approved'
where review_status is null or btrim(review_status) = '' or review_status = 'pending';

alter table public.spark_snapshots
  drop constraint if exists spark_snapshots_review_status_check;

alter table public.spark_snapshots
  add constraint spark_snapshots_review_status_check
  check (review_status in ('pending', 'approved', 'rejected'));

create index if not exists spark_snapshots_public_updated_idx
  on public.spark_snapshots (is_public, updated_at desc);

create index if not exists spark_snapshots_review_status_idx
  on public.spark_snapshots (review_status, updated_at desc);

comment on column public.spark_snapshots.title is '公开展示时使用的游戏标题';
comment on column public.spark_snapshots.description is '公开展示时使用的游戏简介';
comment on column public.spark_snapshots.cover_url is '公开展示时使用的封面图片 URL';
comment on column public.spark_snapshots.is_public is '是否在公开游戏列表中展示';
comment on column public.spark_snapshots.review_status is '审核状态：pending/approved/rejected，仅 approved 会在 /games 展示';
comment on column public.spark_snapshots.review_note is '管理员审核备注';
comment on column public.spark_snapshots.reviewed_by is '审核人 user_id';
comment on column public.spark_snapshots.reviewed_at is '审核时间';
