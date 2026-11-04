#!/usr/bin/env bash
# 將全部 migration + seed 合成一份,畀冇 CLI 嘅時候貼入 Supabase SQL Editor。
set -euo pipefail
cd "$(dirname "$0")/.."
{
  echo "-- UNFOODIE 全部 schema + 示範資料。由 supabase/build_deploy_sql.sh 生成,唔好手改。"
  echo "-- 喺一個全新嘅 Supabase project 嘅 SQL Editor 貼一次就得。"
  for f in supabase/migrations/*.sql data/seed.sql; do echo; echo "-- ===== $f"; cat "$f"; done
} > supabase/deploy_all.sql
