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
