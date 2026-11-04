-- UNFOODIE 03 — 食評人、post、mention(核心 mapping graph)

create type platform as enum (
  'instagram', 'threads', 'youtube', 'xiaohongshu', 'x', 'tabelog', 'blog', 'other'
);

create table foodie (
  id             uuid primary key default gen_random_uuid(),
  display_name   text not null,
  primary_market char(2),
  claimed_by     uuid references auth.users(id) on delete set null,  -- 本人認領
  claimed_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger foodie_touch before update on foodie
  for each row execute function touch_updated_at();

create table foodie_account (
  id             uuid primary key default gen_random_uuid(),
  foodie_id      uuid not null references foodie(id) on delete cascade,
  platform       platform not null,
  handle         text not null,
  url            text,
  follower_count int,
  unique (platform, handle)
);

create index foodie_account_foodie_idx on foodie_account (foodie_id);


-- ---------------------------------------------------------------
-- post — provenance 決定可否再分發
-- ---------------------------------------------------------------

create type ingest_source as enum (
  'share_sheet',           -- 用戶主動分享(主力)
  'threads_api',
  'youtube_api',
  'instagram_graph_api',
  'manual',                -- 人手輸入
  'browser_seed'           -- Tampermonkey / browser automation 開荒
);

create table post (
  id                uuid primary key default gen_random_uuid(),
  foodie_account_id uuid not null references foodie_account(id) on delete restrict,
  url               text not null unique,
  posted_at         timestamptz,
  caption           text,
  lang              text,
  ingest_source     ingest_source not null,

  -- 爬返嚟嘅內容永遠唔會出現喺開源 dataset。呢個唔可以由應用層決定。
  redistributable   boolean generated always as (
    ingest_source <> 'browser_seed'::ingest_source
  ) stored,

  ingested_at       timestamptz not null default now(),
  ingested_by       uuid references auth.users(id) on delete set null
);

create index post_account_time_idx on post (foodie_account_id, posted_at desc);
create index post_redist_idx       on post (redistributable) where redistributable;


-- ---------------------------------------------------------------
-- mention — 核心 mapping graph
-- ---------------------------------------------------------------

create type mention_status    as enum ('active', 'disputed', 'retracted');
create type resolution_method as enum ('llm_auto', 'llm_geotag', 'human', 'user_fix');

create table mention (
  id                   uuid primary key default gen_random_uuid(),
  post_id              uuid not null references post(id) on delete restrict,
  restaurant_id        uuid not null references restaurant(id) on delete restrict,

  -- −1 劣評 / −0.5 負面 / 0 純提及 / +0.5 正面 / +1 力讚
  sentiment_score      real not null check (sentiment_score between -1 and 1),
  sentiment_confidence real check (sentiment_confidence between 0 and 1),
  match_confidence     real not null check (match_confidence between 0 and 1),

  resolution_method    resolution_method not null,
  status               mention_status not null default 'active',
  is_disclosed_ad      boolean not null default false,  -- 食評人主動申報

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (post_id, restaurant_id)
);

create index mention_restaurant_idx on mention (restaurant_id) where status = 'active';
create index mention_lowconf_idx    on mention (match_confidence)
  where resolution_method = 'llm_auto' and status = 'active';

create trigger mention_touch before update on mention
  for each row execute function touch_updated_at();

-- 刪除 edge 正正就係食評人想要嘅結果 —— 一律唔准。
create or replace function block_mention_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'mention 唔可以刪除,只可以將 status 改做 disputed 或 retracted';
end $$;

create trigger mention_no_delete before delete on mention
  for each row execute function block_mention_delete();

comment on table mention is
  '邊個 foodie 講過邊間舖。只可標記爭議,永不刪除(見 mention_no_delete)。';
