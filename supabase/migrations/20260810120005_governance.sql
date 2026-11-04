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
