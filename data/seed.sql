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
