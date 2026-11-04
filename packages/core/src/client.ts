import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient;

export interface UnfoodieConfig {
  url: string;
  anonKey: string;
}

export function makeClient(cfg: UnfoodieConfig, opts?: { storage?: any }): Db {
  return createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // React Native 要傳 AsyncStorage 入嚟;web 用預設 localStorage
      ...(opts?.storage ? { storage: opts.storage } : {}),
    },
  });
}
