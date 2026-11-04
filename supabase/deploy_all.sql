-- UNFOODIE 全部 schema + 示範資料。由 supabase/build_deploy_sql.sh 生成,唔好手改。
-- 喺一個全新嘅 Supabase project 嘅 SQL Editor 貼一次就得。

-- ===== supabase/migrations/20260810120001_extensions.sql
-- UNFOODIE 01 — extensions 同共用工具
--
-- 設計原則(全份 schema 適用):
--   1. Hot path 唔 call 第三方 API,一切查自己個 DB
--   2. mention 只可標記爭議,永不刪除
--   3. 用戶信任等級同餐廳評分由 RLS 鎖死
--   4. redistributable 由來源決定,generated column 防止漂移

create extension if not exists postgis;
create extension if not exists pg_trgm;

-- 共用 updated_at trigger
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ===== supabase/migrations/20260810120002_restaurant.sql
-- UNFOODIE 02 — 餐廳 spine
--
-- 所有外部來源都 resolve 去同一個 restaurant.id。
-- Overture GERS 係主要來源;Google Place ID 只准儲 ID,唔准儲詳細資料。

create table restaurant (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  name_local   text,                       -- 日文/中文原名
  name_romaji  text,                        -- 日本店羅馬字,配對用
  country_code char(2) not null,            -- 'HK' / 'JP'
  address      text,
  geom         geography(point, 4326) not null,
  cuisine      text[],
  closed_at    date,                        -- 執笠,唔刪
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index restaurant_geom_idx      on restaurant using gist (geom);
create index restaurant_name_trgm     on restaurant using gin (name gin_trgm_ops);
create index restaurant_name_loc_trgm on restaurant using gin (name_local gin_trgm_ops);
create index restaurant_open_idx      on restaurant (country_code) where closed_at is null;

create trigger restaurant_touch before update on restaurant
  for each row execute function touch_updated_at();


create type external_source as enum (
  'overture_gers', 'osm', 'google_place', 'apple_mapkit', 'tabelog', 'openrice'
);

create table restaurant_external_id (
  restaurant_id   uuid not null references restaurant(id) on delete cascade,
  source          external_source not null,
  external_id     text not null,
  -- overture/osm/google_place = true(只係 ID 本身)
  -- apple_mapkit/tabelog/openrice = false
  redistributable boolean not null,
  primary key (restaurant_id, source)
);

create unique index restaurant_external_uniq
  on restaurant_external_id (source, external_id);

comment on column restaurant_external_id.redistributable is
  'Apple MapKit 條款禁止儲存其資料;Tabelog/OpenRice 冇授權。呢兩個來源永遠 false。';

-- ===== supabase/migrations/20260810120003_foodie_post_mention.sql
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

-- ===== supabase/migrations/20260810120004_stance_rating.sql
-- UNFOODIE 04 — 用戶信任等級同餐廳評分
--
-- 呢兩張表係整個 app 嘅私隱核心。RLS 唔係 nice-to-have,
-- 佢係「你嘅資料唔會離開你個 account」呢個承諾嘅結構性保證。

create type stance_tier as enum (
  'super_trust', 'high_trust', 'trust', 'fair',
  'distrust', 'high_distrust', 'super_distrust'
);

-- 減分嘅原因意思差天共地,一定要分開存:
--   suspected_ad   = 佢唔誠實
--   taste_mismatch = 佢好誠實,但口味同你相反
-- 後者唔可以入公開聚合統計(見 07 functions)。
create type stance_reason as enum (
  'manual', 'taste_match', 'taste_mismatch', 'suspected_ad', 'other'
);

-- 權重係資料,唔係 schema。調校數字 = update 一行,唔使 migration。
create table stance_weight (
  tier   stance_tier primary key,
  weight real not null,
  quota  int          -- null = 無限
);

insert into stance_weight (tier, weight, quota) values
  ('super_trust',     10,    5),
  ('high_trust',       5,   20),
  ('trust',            1, null),
  ('fair',             0, null),
  ('distrust',        -1, null),
  ('high_distrust',   -5,   20),
  ('super_distrust', -10,    5);

comment on table stance_weight is
  '名額限制係防止等級通脹。冇咗佢,三個月後個 scale 就塌返做 ±1,加權等於白做。';


create table user_foodie_stance (
  user_id    uuid not null references auth.users(id) on delete cascade,
  foodie_id  uuid not null references foodie(id) on delete cascade,
  tier       stance_tier not null,
  reason     stance_reason not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, foodie_id)
);

create index stance_foodie_idx on user_foodie_stance (foodie_id);

create trigger stance_touch before update on user_foodie_stance
  for each row execute function touch_updated_at();

alter table user_foodie_stance enable row level security;
create policy own_stance_only on user_foodie_stance
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- 名額限制
create or replace function enforce_stance_quota() returns trigger
language plpgsql as $$
declare
  q    int;
  used int;
begin
  select quota into q from stance_weight where tier = new.tier;
  if q is null then
    return new;
  end if;

  select count(*) into used
    from user_foodie_stance
   where user_id = new.user_id
     and tier    = new.tier
     and foodie_id <> new.foodie_id;

  if used >= q then
    raise exception '% 只有 % 個位,要先移走一個', new.tier, q
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger stance_quota before insert or update on user_foodie_stance
  for each row execute function enforce_stance_quota();


-- ---------------------------------------------------------------
-- 餐廳評分 —— 同 mention.sentiment_score 用同一把五檔尺
-- (兩邊唔同尺就冇得做相關性)
-- ---------------------------------------------------------------

create table user_rating (
  user_id       uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  score         real not null check (score between -1 and 1),
  visited_on    date,
  note          text,
  -- 「可以喺 app 入面攞去配對」,唔係「可以打包派街坊」
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);

create index rating_restaurant_idx on user_rating (restaurant_id);
create index rating_public_idx     on user_rating (restaurant_id) where is_public;

create trigger rating_touch before update on user_rating
  for each row execute function touch_updated_at();

alter table user_rating enable row level security;
create policy own_rating on user_rating
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy public_rating_read on user_rating
  for select using (is_public);


-- 口味相似度快取(用戶加評分時增量重算,唔喺 hot path)
create table taste_match (
  user_id      uuid not null references auth.users(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('foodie', 'user')),
  subject_id   uuid not null,
  sim          real not null,
  sim_shrunk   real not null,
  n_overlap    int  not null,
  computed_at  timestamptz not null default now(),
  primary key (user_id, subject_kind, subject_id)
);

alter table taste_match enable row level security;
create policy own_match on taste_match
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== supabase/migrations/20260810120005_governance.sql
-- UNFOODIE 05 — 眾包治理同法律防線
--
-- 設計前提:食評人有直接經濟誘因去篡改 mention graph
-- (刪走自己啲收錢 post、加返啲假嘅正面 edge)。呢個係系統嘅主要攻擊面。

create type proposal_kind as enum (
  'remap_restaurant', 'fix_sentiment', 'add_mention',
  'flag_dispute', 'merge_restaurant', 'update_restaurant'
);
create type proposal_status as enum ('pending', 'accepted', 'rejected', 'auto_accepted');

create table edit_proposal (
  id            uuid primary key default gen_random_uuid(),
  kind          proposal_kind not null,
  mention_id    uuid references mention(id) on delete restrict,
  restaurant_id uuid references restaurant(id) on delete restrict,
  payload       jsonb not null,
  rationale     text,
  proposed_by   uuid references auth.users(id) on delete set null,
  status        proposal_status not null default 'pending',
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index proposal_pending_idx on edit_proposal (created_at) where status = 'pending';
create index proposal_mention_idx on edit_proposal (mention_id);

create table proposal_vote (
  proposal_id uuid not null references edit_proposal(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  agree       boolean not null,
  created_at  timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create table contributor (
  user_id                     uuid primary key references auth.users(id) on delete cascade,
  accepted_edits              int not null default 0,
  rejected_edits              int not null default 0,
  -- 0 新手(要覆核) / 1 可信 / 2 直接寫入
  trust_level                 smallint not null default 0 check (trust_level between 0 and 2),
  -- 利益申報:貢獻者本人就係某個食評人
  declared_conflict_foodie_id uuid references foodie(id) on delete set null,
  created_at                  timestamptz not null default now()
);


-- ---------------------------------------------------------------
-- Audit log —— 既係反篡改,亦係下架程序嘅法律紀錄
-- ---------------------------------------------------------------

create table audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);

create index audit_entity_idx on audit_log (entity_type, entity_id, at desc);


-- ---------------------------------------------------------------
-- 下架請求 —— 唔係行政表,係防線
--
-- 香港嘅 innocent dissemination 抗辯(東方報業 v Fevaworks, 2013 終院)
-- 取決於「收到通知後有冇及時處理」。received_at → responded_at 之間
-- 嗰段時間,就係抗辯嘅證據本身。
-- ---------------------------------------------------------------

create type takedown_status as enum ('received', 'under_review', 'actioned', 'rejected');

create table takedown_request (
  id                uuid primary key default gen_random_uuid(),
  subject_foodie_id uuid references foodie(id) on delete set null,
  mention_id        uuid references mention(id) on delete restrict,
  claimant_name     text not null,
  claimant_contact  text not null,
  claim             text not null,
  status            takedown_status not null default 'received',
  received_at       timestamptz not null default now(),
  responded_at      timestamptz,
  action_note       text
);

create index takedown_open_idx on takedown_request (received_at)
  where status in ('received', 'under_review');

comment on table takedown_request is
  '目標:48 小時內回應。所有動作必須同時寫入 audit_log。';

-- ===== supabase/migrations/20260810120006_trip.sql
-- UNFOODIE 06 — 行程(日本場景)
--
-- 「附近餐廳」喺日本場景係廢嘅:你人喺香港計劃下個月去東京。
-- 目標用戶係香港人,覆蓋兩個場景 —— 今晚食乜 / 下個月去東京食乜。

create table trip (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  country_code char(2),
  bbox         geography(polygon, 4326),
  starts_on    date,
  ends_on      date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index trip_user_idx on trip (user_id, starts_on desc);

create trigger trip_touch before update on trip
  for each row execute function touch_updated_at();

alter table trip enable row level security;
create policy own_trip on trip
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


create table trip_item (
  trip_id       uuid not null references trip(id) on delete cascade,
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  note          text,
  added_at      timestamptz not null default now(),
  primary key (trip_id, restaurant_id)
);

alter table trip_item enable row level security;
create policy own_trip_item on trip_item
  for all using (
    exists (select 1 from trip t where t.id = trip_item.trip_id and t.user_id = auth.uid())
  ) with check (
    exists (select 1 from trip t where t.id = trip_item.trip_id and t.user_id = auth.uid())
  );

-- ===== supabase/migrations/20260810120007_functions.sql
-- UNFOODIE 07 — 評分、口味配對、公開聚合
--
-- 全部 SECURITY INVOKER(預設)。即係話 user_foodie_stance 同 user_rating
-- 嘅 RLS 照樣生效:用戶 A 攞用戶 B 個 uuid 嚟叫,join 出嚟係空,
-- 所有權重變 0。私隱保護唔靠函數本身,靠 RLS。


-- ---------------------------------------------------------------
-- 附近餐廳 + 信任訊號
--
--   score       = Σ(權重 × 評價 × 配對信心 × 時間衰減)   → 排序
--   score_norm  = score ÷ Σ|權重 × 信心 × 衰減|          → 公平比較(−1..+1)
--
-- 四象限 count 唔係額外資料,係 UI 嘅必需品:
-- 一個數字冇人信,「3 個你信嘅人讚 · 1 個你唔信嘅人讚」一睇就明。
-- ---------------------------------------------------------------

create or replace function nearby_with_score(
  p_user           uuid,
  p_lat            double precision,
  p_lng            double precision,
  p_radius_m       int  default 1000,
  p_min_match      real default 0.5,
  p_half_life_days int  default 548     -- 18 個月。0 = 唔衰減
)
returns table (
  restaurant_id  uuid,
  name           text,
  lng            double precision,
  lat            double precision,
  distance_m     double precision,
  score          real,
  score_norm     real,
  n_signal       int,
  trusted_pos    int,
  trusted_neg    int,
  distrusted_pos int,
  distrusted_neg int,
  unknown_pos    int
)
language sql
stable
as $$
  with near as (
    select r.id, r.name,
           st_x(r.geom::geometry) as x,
           st_y(r.geom::geometry) as y,
           st_distance(r.geom, st_makepoint(p_lng, p_lat)::geography) as d
    from restaurant r
    where st_dwithin(r.geom, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
      and r.closed_at is null
  ),
  raw as (
    select
      m.restaurant_id,
      coalesce(sw.weight, 0) as w,
      m.sentiment_score      as sent,
      -- k = 配對信心 × 時間衰減。greatest(0,...) 擋住未來日期嘅壞資料。
      m.match_confidence * case
        when p_half_life_days > 0
        then power(
               0.5,
               greatest(0, extract(epoch from now() - p.posted_at))
                 / (p_half_life_days * 86400.0)
             )
        else 1
      end as k
    from mention m
      join post p            on p.id  = m.post_id
      join foodie_account fa on fa.id = p.foodie_account_id
      left join user_foodie_stance s
             on s.foodie_id = fa.foodie_id and s.user_id = p_user
      left join stance_weight sw on sw.tier = s.tier
    where m.status = 'active'
      and m.match_confidence >= p_min_match
      and not m.is_disclosed_ad         -- 申報咗嘅合作內容唔計入餐廳分數
      and p.posted_at is not null       -- 冇日期就計唔到衰減,寧願唔計分
      and m.restaurant_id in (select id from near)
  ),
  agg as (
    select
      raw.restaurant_id,
      sum(w * sent * k)::real                                   as score,
      (sum(w * sent * k) / nullif(sum(abs(w) * k), 0))::real     as score_norm,
      count(*) filter (where w <> 0)::int                        as n_signal,
      count(*) filter (where w > 0 and sent > 0)::int            as trusted_pos,
      count(*) filter (where w > 0 and sent < 0)::int            as trusted_neg,
      count(*) filter (where w < 0 and sent > 0)::int            as distrusted_pos,
      count(*) filter (where w < 0 and sent < 0)::int            as distrusted_neg,
      count(*) filter (where w = 0 and sent > 0)::int            as unknown_pos
    from raw
    group by raw.restaurant_id
  )
  select
    n.id, n.name, n.x, n.y, n.d,
    coalesce(a.score, 0)::real,
    a.score_norm,
    coalesce(a.n_signal, 0),
    coalesce(a.trusted_pos, 0),
    coalesce(a.trusted_neg, 0),
    coalesce(a.distrusted_pos, 0),
    coalesce(a.distrusted_neg, 0),
    coalesce(a.unknown_pos, 0)
  from near n
    left join agg a on a.restaurant_id = n.id
  order by
    -- 樣本太細嘅平均數唔可信,少過 3 個訊號就跌返 raw score
    case when coalesce(a.n_signal, 0) >= 3 then a.score_norm end desc nulls last,
    coalesce(a.score, 0) desc,
    n.d;
$$;

comment on function nearby_with_score is
  'p_half_life_days 唔係 tuning 參數,係產品政策:因為冇設負向封頂,'
  '佢單獨決定咗一篇舊鱔稿要幾耐先唔再影響一間舖。';


-- ---------------------------------------------------------------
-- 口味配對 —— 解冷啟動
--
-- 新用戶白名單係空嘅,所以 app 對佢嚟講一開始係廢嘅。
-- 反轉條問題:唔問「你信邊個」,問「你食過乜」。
-- ---------------------------------------------------------------

create or replace function taste_match_foodies(
  p_user        uuid,
  p_min_overlap int  default 3,
  p_lambda      real default 8.0    -- 收縮係數
)
returns table (
  foodie_id      uuid,
  sim            real,
  sim_shrunk     real,
  n_overlap      int,
  suggested_tier stance_tier,
  reason         stance_reason
)
language sql
stable
as $$
  with foodie_view as (
    -- 同一個 foodie 講過同一間舖多次 → 取平均
    select fa.foodie_id, m.restaurant_id, avg(m.sentiment_score) as sent
    from mention m
      join post p            on p.id  = m.post_id
      join foodie_account fa on fa.id = p.foodie_account_id
    where m.status = 'active'
      and m.match_confidence >= 0.5
      and not m.is_disclosed_ad
    group by fa.foodie_id, m.restaurant_id
  ),
  paired as (
    select fv.foodie_id,
           ur.score::double precision as u,
           fv.sent::double precision  as f
    from user_rating ur
      join foodie_view fv on fv.restaurant_id = ur.restaurant_id
    where ur.user_id = p_user
  ),
  stats as (
    select paired.foodie_id,
           corr(u, f)::real as sim,
           count(*)::int    as n
    from paired
    group by paired.foodie_id
    having count(*) >= p_min_overlap
       and corr(u, f) is not null    -- 一面倒評分算唔到相關性
  )
  select
    stats.foodie_id,
    stats.sim,
    (stats.sim * stats.n / (stats.n + p_lambda))::real as sim_shrunk,
    stats.n,
    (case
       when stats.sim * stats.n / (stats.n + p_lambda) >=  0.65 then 'super_trust'
       when stats.sim * stats.n / (stats.n + p_lambda) >=  0.40 then 'high_trust'
       when stats.sim * stats.n / (stats.n + p_lambda) >=  0.15 then 'trust'
       when stats.sim * stats.n / (stats.n + p_lambda) <= -0.65 then 'super_distrust'
       when stats.sim * stats.n / (stats.n + p_lambda) <= -0.40 then 'high_distrust'
       when stats.sim * stats.n / (stats.n + p_lambda) <= -0.15 then 'distrust'
       else 'fair'
     end)::stance_tier,
    (case when stats.sim >= 0 then 'taste_match' else 'taste_mismatch' end)::stance_reason
  from stats
  order by abs(stats.sim * stats.n / (stats.n + p_lambda)) desc;
$$;

comment on function taste_match_foodies is
  '結果永遠只係建議,要用戶親自確認先寫入 user_foodie_stance。'
  '自動分配信任就變返黑箱推薦系統,同我哋批評緊嗰啲平台冇分別。';


-- ---------------------------------------------------------------
-- 公開聚合統計(Layer 2)
--
-- 注意:呢個 materialized view 由 migration role 建立,所以計算時
-- 繞過 user_foodie_stance 嘅 RLS。呢個係刻意嘅 —— 亦即係話
-- 佢入面每一個欄位都必須係安全公開嘅。兩重保護:
--   1. having >= 50   k-anonymity,防止細樣本反推個別用戶
--   2. taste_mismatch 排除 —— 口味唔夾唔等於唔誠實,溝埋就變成
--      將「唔誠實」嘅暗示扣喺一個可能只係鍾意食辣嘅人身上
-- ---------------------------------------------------------------

create materialized view foodie_public_stats as
select
  f.id                                                as foodie_id,
  count(*)::int                                       as total_stances,
  (count(*) filter (where sw.weight < 0))::real
    / nullif(count(*), 0)                             as hidden_ratio
from foodie f
  join user_foodie_stance s on s.foodie_id = f.id
  join stance_weight sw     on sw.tier = s.tier
where f.primary_market is distinct from 'JP'   -- 日本刑事誹謗風險,唔上 Layer 2
  and s.reason <> 'taste_mismatch'
group by f.id
having count(*) >= 50;

create unique index foodie_public_stats_pk on foodie_public_stats (foodie_id);

comment on materialized view foodie_public_stats is
  '只可以用中性事實陳述呈現(「62% 用戶隱藏咗呢位食評人」),'
  '唔可以做成排行榜 —— 排行榜係我哋自己加嘅 imputation,唔再受真實性抗辯保護。'
  '需要定期 refresh(Supabase 用 pg_cron)。';


-- 讀取權限
grant select on foodie_public_stats to authenticated;
grant select on stance_weight       to authenticated, anon;
grant execute on function nearby_with_score(uuid, double precision, double precision, int, real, int)
  to authenticated;
grant execute on function taste_match_foodies(uuid, int, real) to authenticated;

-- ===== supabase/migrations/20260810120008_grants.sql
-- UNFOODIE 08 — 權限
--
-- ⚠️ RLS 同 GRANT 係兩個獨立機制,缺一不可:
--      淨係 RLS 冇 GRANT  → 連自己啲資料都讀唔到(PostgREST 直接 42501)
--      淨係 GRANT 冇 RLS  → 全世界睇晒
--    RLS 揀邊啲行,GRANT 決定入唔入到度。

-- ---------------------------------------------------------------
-- 公共資料(commons)—— 呢啲就係將來開源嗰批
-- ---------------------------------------------------------------

grant select on
  restaurant,
  restaurant_external_id,
  foodie,
  foodie_account,
  post,
  mention,
  stance_weight
to anon, authenticated;


-- ---------------------------------------------------------------
-- 個人資料 —— GRANT 開門,RLS 揀行
-- ---------------------------------------------------------------

grant select, insert, update, delete on
  user_foodie_stance,
  user_rating,
  trip,
  trip_item
to authenticated;

grant select on taste_match to authenticated;


-- ---------------------------------------------------------------
-- 眾包治理
-- ---------------------------------------------------------------

grant select, insert on edit_proposal, proposal_vote to authenticated;
grant select on contributor to authenticated;

-- 下架請求:投訴人未必有 account,所以 anon 都要提交得到 ——
-- 呢個係 innocent dissemination 抗辯嘅前提(要有一條真係用得嘅通報途徑)。
-- 但冇人讀得返,包括提交者。
grant insert on takedown_request to anon, authenticated;

-- audit_log 唔開放俾任何 client role。


-- ---------------------------------------------------------------
-- 眾包表要 RLS,否則上面個 grant 就係全開
-- ---------------------------------------------------------------

alter table edit_proposal  enable row level security;
alter table proposal_vote  enable row level security;
alter table contributor    enable row level security;

-- 修改建議係公開嘅(要俾人投票),但只可以用自己名義提交
create policy proposal_read   on edit_proposal for select using (true);
create policy proposal_insert on edit_proposal for insert
  with check (proposed_by = auth.uid());

create policy vote_read   on proposal_vote for select using (true);
create policy vote_insert on proposal_vote for insert
  with check (user_id = auth.uid());

-- 貢獻者信譽公開(要顯示「呢個修改由高信譽貢獻者提出」)
create policy contributor_read on contributor for select using (true);

-- ===== supabase/migrations/20260810120009_split_confidence.sql
-- UNFOODIE 09 — 拆開抽取信心同配對信心
--
-- Entity resolution 測試（ingest/eval/RESULTS.md）揭示嘅問題：
-- 原本得一個 match_confidence,由 LLM 填。但 LLM 只知道
--   「呢串字似唔似一個店名」          ← 抽取信心
-- 佢完全唔知道
--   「我哋最後配到嘅係唔係嗰間舖」    ← 配對信心
--
-- 只有後者應該乘入評分公式。一個 LLM 好肯定係店名、但 matcher
-- 配錯咗去隔籬間嘅 mention,唔應該攞到高權重。

alter table mention
  rename column match_confidence to extract_confidence;

comment on column mention.extract_confidence is
  '抽取器信心：呢串字係唔係一個真、搵得返嘅店名。唔會乘入評分。';

alter table mention
  add column match_confidence real check (match_confidence between 0 and 1);

comment on column mention.match_confidence is
  '配對器信心：配到嘅 restaurant 係唔係真係嗰間。'
  '呢個先係乘入 nearby_with_score 嘅數。NULL = 未配對成功。';

-- 已有資料：舊值本身就係人手核實過嘅配對,照搬
update mention set match_confidence = extract_confidence;

-- 配唔到就唔應該有 mention row —— 但配對信心低係容許嘅（會入覆核佇列）
alter table mention alter column match_confidence set not null;

-- 覆核佇列：配對信心低嘅排先
create index mention_review_queue_idx
  on mention (match_confidence)
  where status = 'active' and match_confidence < 0.7;

comment on index mention_review_queue_idx is
  '一半 mention 配唔到或者配得唔穩陣,人手覆核由 nice-to-have 變咗主線功能。';

-- ===== supabase/migrations/20260810120010_lockdown.sql
-- UNFOODIE 10 — 公開部署前收緊權限
--
-- supabase/tests/rls_check.py 用真 JWT 測出嘅問題:
--
--   1. public_rating_read 令 opt-in 嘅評分連 note 都讀到,同 README 承諾相反。
--      RLS 只揀行,揀唔到 column。用戶之間配對未做,所以直接移除;
--      做嗰陣應該經 security definer 函數出聚合結果,唔好再開放原始行。
--   2. post.ingested_by 暴露「邊個用戶 share 咗邊篇」。
--   3. post.caption 會經 API 派出 browser_seed 內容,但嗰批唔可再分發。
--   4. commons 表冇 RLS,安全與否靠 hosted 嘅預設 grant。
--      而家唔再靠預設:先全部 revoke,再逐張開返。

drop policy if exists public_rating_read on user_rating;
drop index if exists rating_public_idx;

-- 只 revoke 我哋自己嘅物件。PostGIS 同 pg_trgm 都裝喺 public,
-- 用 "all ... in schema public" 有機會連 st_dwithin 都鎖死,
-- 而有冇效仲視乎 extension 由邊個 role 擁有,本地同 hosted 未必一樣。
revoke all on
  restaurant, restaurant_external_id, foodie, foodie_account, post, mention,
  user_foodie_stance, stance_weight, user_rating, taste_match,
  edit_proposal, proposal_vote, contributor, audit_log, takedown_request,
  trip, trip_item, foodie_public_stats
from anon, authenticated;

revoke all on function
  nearby_with_score(uuid, double precision, double precision, int, real, int),
  taste_match_foodies(uuid, int, real),
  touch_updated_at(), enforce_stance_quota(), block_mention_delete()
from public, anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- commons:唯讀
grant select on
  restaurant, restaurant_external_id, foodie_account, mention, stance_weight
to anon, authenticated;

grant select (id, display_name, primary_market, created_at) on foodie to anon, authenticated;
grant select (id, foodie_account_id, url, posted_at, lang, ingest_source,
              redistributable, ingested_at)
  on post to anon, authenticated;

-- 個人資料:GRANT 開門,RLS 揀行
grant select, insert, update, delete on
  user_foodie_stance, user_rating, trip, trip_item
to authenticated;
grant select on taste_match to authenticated;

-- 眾包
grant select, insert on edit_proposal, proposal_vote to authenticated;
grant select on contributor to authenticated;
grant select on foodie_public_stats to authenticated;

-- 下架請求:投訴人未必有 account;提交得,讀唔返
grant insert on takedown_request to anon, authenticated;

-- 函數
grant execute on function nearby_with_score(uuid, double precision, double precision, int, real, int)
  to authenticated;
grant execute on function taste_match_foodies(uuid, int, real) to authenticated;

-- 全部表開 RLS,唔再靠 grant 做唯一防線
alter table restaurant             enable row level security;
alter table restaurant_external_id enable row level security;
alter table foodie                 enable row level security;
alter table foodie_account         enable row level security;
alter table post                   enable row level security;
alter table mention                enable row level security;
alter table stance_weight          enable row level security;
alter table audit_log              enable row level security;
alter table takedown_request       enable row level security;

create policy commons_read on restaurant             for select using (true);
create policy commons_read on restaurant_external_id for select using (true);
create policy commons_read on foodie                 for select using (true);
create policy commons_read on foodie_account         for select using (true);
create policy commons_read on post                   for select using (true);
create policy commons_read on mention                for select using (true);
create policy commons_read on stance_weight          for select using (true);

create policy takedown_submit on takedown_request
  for insert to anon, authenticated with check (status = 'received');
-- audit_log:冇 policy = client 乜都做唔到

-- ===== supabase/migrations/20260810120011_fix_ranking.sql
-- UNFOODIE 11 — 修排序
--
-- 舊邏輯:n_signal >= 3 用 score_norm,否則當 null 排最尾。
-- 結果一間 -1.00 嘅舖會排喺一間得 1 個信任好評嘅舖上面。

create or replace function nearby_with_score(
  p_user           uuid,
  p_lat            double precision,
  p_lng            double precision,
  p_radius_m       int  default 1000,
  p_min_match      real default 0.5,
  p_half_life_days int  default 548     -- 18 個月。0 = 唔衰減
)
returns table (
  restaurant_id  uuid,
  name           text,
  lng            double precision,
  lat            double precision,
  distance_m     double precision,
  score          real,
  score_norm     real,
  n_signal       int,
  trusted_pos    int,
  trusted_neg    int,
  distrusted_pos int,
  distrusted_neg int,
  unknown_pos    int
)
language sql
stable
as $$
  with near as (
    select r.id, r.name,
           st_x(r.geom::geometry) as x,
           st_y(r.geom::geometry) as y,
           st_distance(r.geom, st_makepoint(p_lng, p_lat)::geography) as d
    from restaurant r
    where st_dwithin(r.geom, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
      and r.closed_at is null
  ),
  raw as (
    select
      m.restaurant_id,
      coalesce(sw.weight, 0) as w,
      m.sentiment_score      as sent,
      -- k = 配對信心 × 時間衰減。greatest(0,...) 擋住未來日期嘅壞資料。
      m.match_confidence * case
        when p_half_life_days > 0
        then power(
               0.5,
               greatest(0, extract(epoch from now() - p.posted_at))
                 / (p_half_life_days * 86400.0)
             )
        else 1
      end as k
    from mention m
      join post p            on p.id  = m.post_id
      join foodie_account fa on fa.id = p.foodie_account_id
      left join user_foodie_stance s
             on s.foodie_id = fa.foodie_id and s.user_id = p_user
      left join stance_weight sw on sw.tier = s.tier
    where m.status = 'active'
      and m.match_confidence >= p_min_match
      and not m.is_disclosed_ad         -- 申報咗嘅合作內容唔計入餐廳分數
      and p.posted_at is not null       -- 冇日期就計唔到衰減,寧願唔計分
      and m.restaurant_id in (select id from near)
  ),
  agg as (
    select
      raw.restaurant_id,
      sum(w * sent * k)::real                                   as score,
      (sum(w * sent * k) / nullif(sum(abs(w) * k), 0))::real     as score_norm,
      count(*) filter (where w <> 0)::int                        as n_signal,
      count(*) filter (where w > 0 and sent > 0)::int            as trusted_pos,
      count(*) filter (where w > 0 and sent < 0)::int            as trusted_neg,
      count(*) filter (where w < 0 and sent > 0)::int            as distrusted_pos,
      count(*) filter (where w < 0 and sent < 0)::int            as distrusted_neg,
      count(*) filter (where w = 0 and sent > 0)::int            as unknown_pos
    from raw
    group by raw.restaurant_id
  )
  select
    n.id, n.name, n.x, n.y, n.d,
    coalesce(a.score, 0)::real,
    a.score_norm,
    coalesce(a.n_signal, 0),
    coalesce(a.trusted_pos, 0),
    coalesce(a.trusted_neg, 0),
    coalesce(a.distrusted_pos, 0),
    coalesce(a.distrusted_neg, 0),
    coalesce(a.unknown_pos, 0)
  from near n
    left join agg a on a.restaurant_id = n.id
  order by
    -- 單一排序鍵:加權平均 × 樣本收縮。正分永遠喺負分上面,
    -- 細樣本會向 0 靠,但唔會因為變 null 而跌到負分舖下面。
    coalesce(a.score_norm, 0) * coalesce(a.n_signal, 0)
      / (coalesce(a.n_signal, 0) + 2.0) desc,
    n.d;
$$;

-- ===== data/seed.sql
-- UNFOODIE — 手動 seed 資料
--
-- 目的:令成個 app 喺完全冇抽取 pipeline 嘅情況下都行得起。
-- 40 條手寫 mention 會比 10,000 條自動抽取更快話到你聽個產品好唔好用。
--
-- ⚠️ 食評人同餐廳名全部係虛構嘅,座標先係真。
--    呢個唔係求其 —— 呢份檔案會入開源 repo,而虛構「某某真人係鱔稿王」
--    或者「某間真舖好難食」,正正就係成個 project 設計嚟避免嘅嘢。
--    示範資料唔應該用真人真舖嚟砌。

begin;

-- ---------------------------------------------------------------
-- 餐廳 —— 虛構名,真實香港/東京座標
-- ---------------------------------------------------------------

insert into restaurant (id, name, country_code, address, geom, cuisine) values
 ('11111111-0000-4000-8000-000000000001','好運茶餐廳','HK','旺角',     st_makepoint(114.1694,22.3193)::geography, '{茶餐廳}'),
 ('11111111-0000-4000-8000-000000000002','金裝燒味','HK','深水埗',     st_makepoint(114.1622,22.3303)::geography, '{燒味,粵菜}'),
 ('11111111-0000-4000-8000-000000000003','一碗麵','HK','太子',         st_makepoint(114.1682,22.3248)::geography, '{麵食}'),
 ('11111111-0000-4000-8000-000000000004','星輝扒房','HK','中環',       st_makepoint(114.1582,22.2819)::geography, '{扒房,西餐}'),
 ('11111111-0000-4000-8000-000000000005','老陳粥店','HK','上環',       st_makepoint(114.1495,22.2867)::geography, '{粥品}'),
 ('11111111-0000-4000-8000-000000000006','海景日料','HK','灣仔',       st_makepoint(114.1730,22.2775)::geography, '{日本菜}'),
 ('11111111-0000-4000-8000-000000000007','隱世咖啡','HK','堅尼地城',   st_makepoint(114.1288,22.2820)::geography, '{咖啡,輕食}'),
 ('11111111-0000-4000-8000-000000000008','銅記火鍋','HK','銅鑼灣',     st_makepoint(114.1846,22.2800)::geography, '{火鍋}'),
 ('11111111-0000-4000-8000-000000000009','尖沙咀牛腩','HK','尖沙咀',   st_makepoint(114.1722,22.2976)::geography, '{麵食,牛腩}'),
 ('11111111-0000-4000-8000-000000000010','北角魚蛋','HK','北角',       st_makepoint(114.2005,22.2913)::geography, '{小食}'),
 ('11111111-0000-4000-8000-000000000011','貴價和牛','HK','中環',       st_makepoint(114.1595,22.2825)::geography, '{燒肉,日本菜}'),
 ('11111111-0000-4000-8000-000000000012','街角雞蛋仔','HK','深水埗',   st_makepoint(114.1635,22.3311)::geography, '{小食}'),
 ('11111111-0000-4000-8000-000000000013','新派點心','HK','灣仔',       st_makepoint(114.1745,22.2780)::geography, '{點心,粵菜}'),
 ('11111111-0000-4000-8000-000000000014','渋谷拉麵處','JP','渋谷',     st_makepoint(139.7005,35.6595)::geography, '{拉麵}'),
 ('11111111-0000-4000-8000-000000000015','銀座壽司幸','JP','銀座',     st_makepoint(139.7650,35.6717)::geography, '{壽司}'),
 ('11111111-0000-4000-8000-000000000016','新宿餃子屋','JP','新宿',     st_makepoint(139.7006,35.6896)::geography, '{餃子,中華}');


-- ---------------------------------------------------------------
-- 食評人(虛構)
-- ---------------------------------------------------------------

insert into foodie (id, display_name, primary_market) values
 ('22222222-0000-4000-8000-000000000001','觀塘食神','HK'),
 ('22222222-0000-4000-8000-000000000002','深水埗掃街王','HK'),
 ('22222222-0000-4000-8000-000000000003','米芝蓮獵人','HK'),
 ('22222222-0000-4000-8000-000000000004','東京食堂日記','HK'),
 ('22222222-0000-4000-8000-000000000005','全城最抵食','HK'),
 ('22222222-0000-4000-8000-000000000006','新張快閃','HK'),
 ('22222222-0000-4000-8000-000000000007','家常菜姐姐','HK'),
 ('22222222-0000-4000-8000-000000000008','拉麵狂人','HK');

insert into foodie_account (id, foodie_id, platform, handle, url, follower_count) values
 ('33333333-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','youtube', 'kwuntong_god',   'https://example.invalid/kwuntong_god',   182000),
 ('33333333-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000002','instagram','ssp_streeteats','https://example.invalid/ssp_streeteats',  46000),
 ('33333333-0000-4000-8000-000000000003','22222222-0000-4000-8000-000000000003','instagram','michelin_hunter','https://example.invalid/michelin_hunter',231000),
 ('33333333-0000-4000-8000-000000000004','22222222-0000-4000-8000-000000000004','youtube', 'tokyo_shokudo',  'https://example.invalid/tokyo_shokudo',   93000),
 ('33333333-0000-4000-8000-000000000005','22222222-0000-4000-8000-000000000005','instagram','bestdeal_hk',   'https://example.invalid/bestdeal_hk',    410000),
 ('33333333-0000-4000-8000-000000000006','22222222-0000-4000-8000-000000000006','instagram','newopen_flash', 'https://example.invalid/newopen_flash',  355000),
 ('33333333-0000-4000-8000-000000000007','22222222-0000-4000-8000-000000000007','blog',    'homecook_sis',  'https://example.invalid/homecook_sis',    12000),
 ('33333333-0000-4000-8000-000000000008','22222222-0000-4000-8000-000000000008','youtube', 'ramen_maniac',  'https://example.invalid/ramen_maniac',    67000);


-- ---------------------------------------------------------------
-- Post + mention
--
-- 用一張臨時表定義,再展開 —— 加減一行 seed 只需改一行。
-- ---------------------------------------------------------------

create temp table _seed (
  handle   text,
  rname    text,
  sent     real,   -- −1 伏 / −0.5 麻麻 / 0 純提及 / +0.5 唔錯 / +1 勁正
  days_ago int,
  conf     real
) on commit drop;

insert into _seed (handle, rname, sent, days_ago, conf) values
  -- 誠實嗰批:覆蓋闊,有讚有彈
  ('kwuntong_god',   '好運茶餐廳',  1.0,  40, 0.95),
  ('kwuntong_god',   '銅記火鍋',    0.5,  85, 0.90),
  ('kwuntong_god',   '星輝扒房',   -1.0,  60, 0.92),
  ('kwuntong_god',   '一碗麵',     -0.5, 120, 0.88),
  ('kwuntong_god',   '北角魚蛋',    0.5, 200, 0.85),
  ('kwuntong_god',   '新派點心',   -0.5,  25, 0.90),

  ('ssp_streeteats', '金裝燒味',    1.0,  30, 0.93),
  ('ssp_streeteats', '街角雞蛋仔',  1.0,  55, 0.91),
  ('ssp_streeteats', '好運茶餐廳',  0.5,  70, 0.89),
  ('ssp_streeteats', '尖沙咀牛腩',  1.0,  95, 0.94),
  ('ssp_streeteats', '北角魚蛋',    0.5, 140, 0.87),
  ('ssp_streeteats', '貴價和牛',   -1.0, 110, 0.90),

  ('homecook_sis',   '好運茶餐廳',  1.0,  20, 0.92),
  ('homecook_sis',   '金裝燒味',    0.5,  45, 0.88),
  ('homecook_sis',   '老陳粥店',    1.0,  65, 0.90),
  ('homecook_sis',   '隱世咖啡',    0.5,  35, 0.86),
  ('homecook_sis',   '北角魚蛋',    1.0, 150, 0.85),
  ('homecook_sis',   '星輝扒房',   -1.0,  80, 0.91),

  ('michelin_hunter','隱世咖啡',    1.0,  28, 0.90),
  ('michelin_hunter','銅記火鍋',    0.5,  50, 0.88),
  ('michelin_hunter','貴價和牛',    1.0,  15, 0.93),
  ('michelin_hunter','銀座壽司幸',  1.0,  75, 0.95),
  ('michelin_hunter','老陳粥店',   -0.5, 100, 0.82),

  -- 日本線
  ('tokyo_shokudo',  '渋谷拉麵處',  1.0,  22, 0.94),
  ('tokyo_shokudo',  '銀座壽司幸',  0.5,  48, 0.92),
  ('tokyo_shokudo',  '新宿餃子屋', -0.5,  66, 0.88),
  ('ramen_maniac',   '渋谷拉麵處',  1.0,  18, 0.96),
  ('ramen_maniac',   '新宿餃子屋',  1.0,  90, 0.89),
  ('ramen_maniac',   '一碗麵',      0.5, 130, 0.85),

  -- 鱔稿味重嗰批:乜都讚,尤其新開嗰啲
  ('bestdeal_hk',    '一碗麵',      1.0,  12, 0.90),
  ('bestdeal_hk',    '星輝扒房',    1.0,  33, 0.92),
  ('bestdeal_hk',    '新派點心',    1.0,  10, 0.91),
  ('bestdeal_hk',    '貴價和牛',    1.0,  58, 0.89),
  ('bestdeal_hk',    '老陳粥店',   -1.0,  88, 0.84),
  ('bestdeal_hk',    '海景日料',    1.0,  42, 0.90),

  ('newopen_flash',  '一碗麵',      1.0,   8, 0.93),
  ('newopen_flash',  '星輝扒房',    1.0,  26, 0.90),
  ('newopen_flash',  '新派點心',    1.0,   6, 0.94),
  ('newopen_flash',  '海景日料',    1.0,  38, 0.88),
  ('newopen_flash',  '老陳粥店',   -1.0,  72, 0.83),
  ('newopen_flash',  '銅記火鍋',    0.5, 105, 0.86);

insert into post (foodie_account_id, url, posted_at, ingest_source, caption, lang)
select fa.id,
       'https://example.invalid/' || s.handle || '/' || md5(s.handle || s.rname),
       now() - (s.days_ago || ' days')::interval,
       'manual',
       s.rname || '(手動 seed 示範資料)',
       'zh-HK'
from _seed s
  join foodie_account fa on fa.handle = s.handle;

insert into mention (post_id, restaurant_id, sentiment_score, sentiment_confidence,
                     extract_confidence, match_confidence, resolution_method)
-- 手寫 seed:抽取同配對都係人手做,兩個信心一樣
select p.id, r.id, s.sent, 0.9, s.conf, s.conf, 'human'
from _seed s
  join post p       on p.url = 'https://example.invalid/' || s.handle || '/' || md5(s.handle || s.rname)
  join restaurant r on r.name = s.rname;

commit;

-- 核對
select (select count(*) from restaurant)     as restaurants,
       (select count(*) from foodie)         as foodies,
       (select count(*) from post)           as posts,
       (select count(*) from mention)        as mentions;
