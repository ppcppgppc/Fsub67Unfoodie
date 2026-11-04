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
