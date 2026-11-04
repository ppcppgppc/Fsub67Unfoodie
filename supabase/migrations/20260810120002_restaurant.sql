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
