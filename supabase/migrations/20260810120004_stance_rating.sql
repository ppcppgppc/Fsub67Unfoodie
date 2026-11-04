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
