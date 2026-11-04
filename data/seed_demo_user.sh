#!/usr/bin/env bash
# 建立本地示範用戶 + 佢嘅信任名單同餐廳評分。
#
# 用戶資料唔可以放喺 seed.sql —— auth.users 屬於 Supabase 管,
# 而且 stance/rating 受 RLS 保護,應該當成真用戶資料嚟建立。
set -euo pipefail

API=${API_URL:-http://127.0.0.1:54321}
SERVICE_KEY=${SERVICE_ROLE_KEY:?請 export SERVICE_ROLE_KEY}
EMAIL=${DEMO_EMAIL:-demo@unfoodie.local}
PASS=${DEMO_PASSWORD:-demo1234}

echo "=== 建立 $EMAIL"
UID_JSON=$(curl -s -X POST "$API/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true}")

USER_ID=$(echo "$UID_JSON" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)

if [ -z "$USER_ID" ]; then
  # 已存在就攞返個 id
  USER_ID=$(curl -s "$API/auth/v1/admin/users" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    | tr ',' '\n' | grep -B0 -A0 '"id"' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
fi

[ -z "$USER_ID" ] && { echo "FAIL: 攞唔到 user id"; echo "$UID_JSON"; exit 1; }
echo "user_id = $USER_ID"

DB=$(docker ps --filter name=supabase_db --format '{{.Names}}' | head -1)

docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -v uid="$USER_ID" <<'SQL'
\set ON_ERROR_STOP on

delete from user_foodie_stance where user_id = :'uid';
delete from user_rating        where user_id = :'uid';

-- 信任名單:兩個超級白名單、一個白名單、兩個超級黑名單
insert into user_foodie_stance (user_id, foodie_id, tier, reason)
select :'uid'::uuid, f.id, v.tier::stance_tier, v.reason::stance_reason
from (values
  ('觀塘食神',     'super_trust',    'manual'),
  ('深水埗掃街王', 'super_trust',    'manual'),
  ('家常菜姐姐',   'high_trust',     'manual'),
  ('拉麵狂人',     'trust',          'manual'),
  ('全城最抵食',   'super_distrust', 'suspected_ad'),
  ('新張快閃',     'super_distrust', 'suspected_ad'),
  ('米芝蓮獵人',   'distrust',       'taste_mismatch')
) as v(name, tier, reason)
join foodie f on f.display_name = v.name;

-- 自己食過嘅評分(同一把五檔尺)
insert into user_rating (user_id, restaurant_id, score, visited_on, is_public)
select :'uid'::uuid, r.id, v.score, current_date - 30, true
from (values
  ('好運茶餐廳',  1.0),
  ('金裝燒味',    1.0),
  ('街角雞蛋仔',  0.5),
  ('星輝扒房',   -1.0),
  ('貴價和牛',   -0.5),
  ('老陳粥店',    1.0),
  ('一碗麵',     -0.5)
) as v(name, score)
join restaurant r on r.name = v.name;

select
  (select count(*) from user_foodie_stance where user_id = :'uid') as stances,
  (select count(*) from user_rating        where user_id = :'uid') as ratings;
SQL

echo "=== 完成。登入:$EMAIL / $PASS"
