-- UNFOODIE 07 — 評分、口味配對、公開聚合
--
-- 全部 SECURITY INVOKER(預設)。即係話 user_foodie_stance 同 user_rating
-- 嘅 RLS 照樣生效:用戶 A 攞用戶 B 個 uuid 嚟叫,join 出嚟係空,
-- 所有權重變 0。私隱保護唔靠函數本身,靠 RLS。


-- ---------------------------------------------------------------
-- 附近餐廳 + 信任訊號
--
--   score       = Σ(權重 × 評價 × 配對信心 × 時間衰減)   → 排序
--   score_norm  = score ÷ Σ|權重 × 信心 × 衰減|          → 公平比較(−1..+1)
--
-- 四象限 count 唔係額外資料,係 UI 嘅必需品:
-- 一個數字冇人信,「3 個你信嘅人讚 · 1 個你唔信嘅人讚」一睇就明。
-- ---------------------------------------------------------------

create or replace function nearby_with_score(
  p_user           uuid,
  p_lat            double precision,
  p_lng            double precision,
  p_radius_m       int  default 1000,
  p_min_match      real default 0.5,
  p_half_life_days int  default 548     -- 18 個月。0 = 唔衰減
)
returns table (
  restaurant_id  uuid,
  name           text,
  lng            double precision,
  lat            double precision,
  distance_m     double precision,
  score          real,
  score_norm     real,
  n_signal       int,
  trusted_pos    int,
  trusted_neg    int,
  distrusted_pos int,
  distrusted_neg int,
  unknown_pos    int
)
language sql
stable
as $$
  with near as (
    select r.id, r.name,
           st_x(r.geom::geometry) as x,
           st_y(r.geom::geometry) as y,
           st_distance(r.geom, st_makepoint(p_lng, p_lat)::geography) as d
    from restaurant r
    where st_dwithin(r.geom, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
      and r.closed_at is null
  ),
  raw as (
    select
      m.restaurant_id,
      coalesce(sw.weight, 0) as w,
      m.sentiment_score      as sent,
      -- k = 配對信心 × 時間衰減。greatest(0,...) 擋住未來日期嘅壞資料。
      m.match_confidence * case
        when p_half_life_days > 0
        then power(
               0.5,
               greatest(0, extract(epoch from now() - p.posted_at))
                 / (p_half_life_days * 86400.0)
             )
        else 1
      end as k
    from mention m
      join post p            on p.id  = m.post_id
      join foodie_account fa on fa.id = p.foodie_account_id
      left join user_foodie_stance s
             on s.foodie_id = fa.foodie_id and s.user_id = p_user
      left join stance_weight sw on sw.tier = s.tier
    where m.status = 'active'
      and m.match_confidence >= p_min_match
      and not m.is_disclosed_ad         -- 申報咗嘅合作內容唔計入餐廳分數
      and p.posted_at is not null       -- 冇日期就計唔到衰減,寧願唔計分
      and m.restaurant_id in (select id from near)
  ),
  agg as (
    select
      raw.restaurant_id,
      sum(w * sent * k)::real                                   as score,
      (sum(w * sent * k) / nullif(sum(abs(w) * k), 0))::real     as score_norm,
      count(*) filter (where w <> 0)::int                        as n_signal,
      count(*) filter (where w > 0 and sent > 0)::int            as trusted_pos,
      count(*) filter (where w > 0 and sent < 0)::int            as trusted_neg,
      count(*) filter (where w < 0 and sent > 0)::int            as distrusted_pos,
      count(*) filter (where w < 0 and sent < 0)::int            as distrusted_neg,
      count(*) filter (where w = 0 and sent > 0)::int            as unknown_pos
    from raw
    group by raw.restaurant_id
  )
  select
    n.id, n.name, n.x, n.y, n.d,
    coalesce(a.score, 0)::real,
    a.score_norm,
    coalesce(a.n_signal, 0),
    coalesce(a.trusted_pos, 0),
    coalesce(a.trusted_neg, 0),
    coalesce(a.distrusted_pos, 0),
    coalesce(a.distrusted_neg, 0),
    coalesce(a.unknown_pos, 0)
  from near n
    left join agg a on a.restaurant_id = n.id
  order by
    -- 樣本太細嘅平均數唔可信,少過 3 個訊號就跌返 raw score
    case when coalesce(a.n_signal, 0) >= 3 then a.score_norm end desc nulls last,
    coalesce(a.score, 0) desc,
    n.d;
$$;

comment on function nearby_with_score is
  'p_half_life_days 唔係 tuning 參數,係產品政策:因為冇設負向封頂,'
  '佢單獨決定咗一篇舊鱔稿要幾耐先唔再影響一間舖。';


-- ---------------------------------------------------------------
-- 口味配對 —— 解冷啟動
--
-- 新用戶白名單係空嘅,所以 app 對佢嚟講一開始係廢嘅。
-- 反轉條問題:唔問「你信邊個」,問「你食過乜」。
-- ---------------------------------------------------------------

create or replace function taste_match_foodies(
  p_user        uuid,
  p_min_overlap int  default 3,
  p_lambda      real default 8.0    -- 收縮係數
)
returns table (
  foodie_id      uuid,
  sim            real,
  sim_shrunk     real,
  n_overlap      int,
  suggested_tier stance_tier,
  reason         stance_reason
)
language sql
stable
as $$
  with foodie_view as (
    -- 同一個 foodie 講過同一間舖多次 → 取平均
    select fa.foodie_id, m.restaurant_id, avg(m.sentiment_score) as sent
    from mention m
      join post p            on p.id  = m.post_id
      join foodie_account fa on fa.id = p.foodie_account_id
    where m.status = 'active'
      and m.match_confidence >= 0.5
      and not m.is_disclosed_ad
    group by fa.foodie_id, m.restaurant_id
  ),
  paired as (
    select fv.foodie_id,
           ur.score::double precision as u,
           fv.sent::double precision  as f
    from user_rating ur
      join foodie_view fv on fv.restaurant_id = ur.restaurant_id
    where ur.user_id = p_user
  ),
  stats as (
    select paired.foodie_id,
           corr(u, f)::real as sim,
           count(*)::int    as n
    from paired
    group by paired.foodie_id
    having count(*) >= p_min_overlap
       and corr(u, f) is not null    -- 一面倒評分算唔到相關性
  )
  select
    stats.foodie_id,
    stats.sim,
    (stats.sim * stats.n / (stats.n + p_lambda))::real as sim_shrunk,
    stats.n,
    (case
       when stats.sim * stats.n / (stats.n + p_lambda) >=  0.65 then 'super_trust'
       when stats.sim * stats.n / (stats.n + p_lambda) >=  0.40 then 'high_trust'
       when stats.sim * stats.n / (stats.n + p_lambda) >=  0.15 then 'trust'
       when stats.sim * stats.n / (stats.n + p_lambda) <= -0.65 then 'super_distrust'
       when stats.sim * stats.n / (stats.n + p_lambda) <= -0.40 then 'high_distrust'
       when stats.sim * stats.n / (stats.n + p_lambda) <= -0.15 then 'distrust'
       else 'fair'
     end)::stance_tier,
    (case when stats.sim >= 0 then 'taste_match' else 'taste_mismatch' end)::stance_reason
  from stats
  order by abs(stats.sim * stats.n / (stats.n + p_lambda)) desc;
$$;

comment on function taste_match_foodies is
  '結果永遠只係建議,要用戶親自確認先寫入 user_foodie_stance。'
  '自動分配信任就變返黑箱推薦系統,同我哋批評緊嗰啲平台冇分別。';


-- ---------------------------------------------------------------
-- 公開聚合統計(Layer 2)
--
-- 注意:呢個 materialized view 由 migration role 建立,所以計算時
-- 繞過 user_foodie_stance 嘅 RLS。呢個係刻意嘅 —— 亦即係話
-- 佢入面每一個欄位都必須係安全公開嘅。兩重保護:
--   1. having >= 50   k-anonymity,防止細樣本反推個別用戶
--   2. taste_mismatch 排除 —— 口味唔夾唔等於唔誠實,溝埋就變成
--      將「唔誠實」嘅暗示扣喺一個可能只係鍾意食辣嘅人身上
-- ---------------------------------------------------------------

create materialized view foodie_public_stats as
select
  f.id                                                as foodie_id,
  count(*)::int                                       as total_stances,
  (count(*) filter (where sw.weight < 0))::real
    / nullif(count(*), 0)                             as hidden_ratio
from foodie f
  join user_foodie_stance s on s.foodie_id = f.id
  join stance_weight sw     on sw.tier = s.tier
where f.primary_market is distinct from 'JP'   -- 日本刑事誹謗風險,唔上 Layer 2
  and s.reason <> 'taste_mismatch'
group by f.id
having count(*) >= 50;

create unique index foodie_public_stats_pk on foodie_public_stats (foodie_id);

comment on materialized view foodie_public_stats is
  '只可以用中性事實陳述呈現(「62% 用戶隱藏咗呢位食評人」),'
  '唔可以做成排行榜 —— 排行榜係我哋自己加嘅 imputation,唔再受真實性抗辯保護。'
  '需要定期 refresh(Supabase 用 pg_cron)。';


-- 讀取權限
grant select on foodie_public_stats to authenticated;
grant select on stance_weight       to authenticated, anon;
grant execute on function nearby_with_score(uuid, double precision, double precision, int, real, int)
  to authenticated;
grant execute on function taste_match_foodies(uuid, int, real) to authenticated;
