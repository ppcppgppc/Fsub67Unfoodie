import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeClient, type Db } from '@unfoodie/core';
import { useEffect, useState } from 'react';

let _db: Db | null = null;

export function db(): Db {
  if (!_db) {
    _db = makeClient(
      {
        url: process.env.EXPO_PUBLIC_SUPABASE_URL!,
        anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      },
      { storage: AsyncStorage },
    );
  }
  return _db;
}

export function useUser() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    db().auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = db().auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return userId;
}
