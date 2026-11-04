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
