import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeClient, type Db } from '@unfoodie/core';

let _db: Db | null = null;

export function db(): Db {
  if (!_db) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    // 漏咗 env 嘅話,唔好等 supabase-js 拋一句睇唔明嘅錯
    if (!url || !anonKey) {
      throw new Error('未設定 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY(見 app/.env.example)');
    }
    _db = makeClient({ url, anonKey }, { storage: AsyncStorage });
  }
  return _db;
}
