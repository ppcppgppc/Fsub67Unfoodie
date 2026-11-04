-- UNFOODIE 12 — 下架表格公開前收緊
--
-- migration 10 嘅 takedown_submit policy 只鎖死 status = 'received',
-- 但 table-level INSERT grant 令 anon 仲可以自己填:
--
--   received_at   → 倒填日期。innocent dissemination 抗辯靠嘅正正係
--                   received_at → responded_at 之間有幾耐,呢個欄唔可以由投訴人話事
--   responded_at  → 扮已經回覆咗
--   action_note   → 扮處理紀錄
--   id            → 自訂 uuid
--
-- 改做 column-level grant:投訴人只可以填佢應該填嘅欄,其餘一律用預設值。
-- 另外加長度上限,唔好俾人用呢個公開入口塞幾 MB 入 DB。

revoke insert on takedown_request from anon, authenticated;

grant insert (subject_foodie_id, mention_id, claimant_name, claimant_contact, claim)
  on takedown_request to anon, authenticated;

-- not valid:唔追溯檢查舊資料,但所有新 insert 都要過
alter table takedown_request
  add constraint takedown_name_len    check (char_length(claimant_name)    between 1 and 200)  not valid,
  add constraint takedown_contact_len check (char_length(claimant_contact) between 3 and 300)  not valid,
  add constraint takedown_claim_len   check (char_length(claim)            between 1 and 5000) not valid;
