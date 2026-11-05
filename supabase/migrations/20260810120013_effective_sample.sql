-- UNFOODIE 13 — 舊 post 少啲把握
--
-- migration 11 嘅排序鍵係 score_norm × n ÷ (n + 2),n = 有權重嘅 mention 篇數。
-- 問題:收縮只睇篇數,唔睇每篇有幾可信。
--
--   A 舖:4 篇 5 年前嘅好評       n = 4 → 收縮 0.67,排得好前
--   B 舖:1 篇上星期嘅好評        n = 1 → 收縮 0.33
--
-- 但 A 嘅 4 篇喺 score 入面已經衰減到剩 ~10%。score_norm 係加權平均,
-- 如果一間舖啲 post 差唔多一樣舊,衰減喺分子分母就差唔多完全對消 ——
-- 「舊」呢件事幾乎冇影響到排序,只係影響咗一個冇人睇嘅 score。
--
-- 改做用有效樣本 n_eff = Σ(配對信心 × 時間衰減):
--
--   A 舖:n_eff ≈ 4 × 0.1 = 0.4  → 收縮 0.17
--   B 舖:n_eff ≈ 1 × 0.99 = 1.0 → 收縮 0.33
--
-- 新 post 嘅 n_eff 同篇數差唔多,所以近期資料嘅排序基本唔變;
-- 舊資料同低信心配對就自動向 0 靠。正分仍然永遠喺負分上面。
--
-- 回傳欄位唔變(n_signal 照舊係篇數,UI 用嚟顯示同判斷「樣本少」),
-- 所以 create or replace 就得,唔使重新 grant。

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
      -- 有效樣本:每條訊號按「幾有把握」計,唔係按篇數。
      -- 一篇 5 年前嘅 post 只值 ~0.1 篇,配對信心 60% 嘅只值 0.6 篇。
      sum(k) filter (where w <> 0)                               as n_eff,
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
    -- 單一排序鍵:加權平均 × 樣本收縮(用有效樣本)。正分永遠喺負分上面,
    -- 細樣本會向 0 靠,但唔會因為變 null 而跌到負分舖下面。
    coalesce(a.score_norm, 0) * coalesce(a.n_eff, 0)
      / (coalesce(a.n_eff, 0) + 2.0) desc,
    n.d;
$$;
