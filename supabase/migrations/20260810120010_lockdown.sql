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
