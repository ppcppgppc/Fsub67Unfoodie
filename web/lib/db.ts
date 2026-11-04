'use client';

import { makeClient, type Db } from '@unfoodie/core';

let _db: Db | null = null;

export function db(): Db {
  if (!_db) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // 部署漏咗 env 嘅話,唔好等 supabase-js 拋一句睇唔明嘅錯
    if (!url || !anonKey) {
      throw new Error('未設定 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY(見 web/.env.example)');
    }
    _db = makeClient({ url, anonKey });
  }
  return _db;
}
