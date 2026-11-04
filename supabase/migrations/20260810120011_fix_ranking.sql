-- UNFOODIE 11 — 修排序
--
-- 舊邏輯:n_signal >= 3 用 score_norm,否則當 null 排最尾。
-- 結果一間 -1.00 嘅舖會排喺一間得 1 個信任好評嘅舖上面。

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
    -- 單一排序鍵:加權平均 × 樣本收縮。正分永遠喺負分上面,
    -- 細樣本會向 0 靠,但唔會因為變 null 而跌到負分舖下面。
    coalesce(a.score_norm, 0) * coalesce(a.n_signal, 0)
      / (coalesce(a.n_signal, 0) + 2.0) desc,
    n.d;
$$;
