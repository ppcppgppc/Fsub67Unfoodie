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
