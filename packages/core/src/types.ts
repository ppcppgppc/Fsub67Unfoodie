// UNFOODIE — 對應 supabase/migrations 嘅型別

export type StanceTier =
  | 'super_trust'
  | 'high_trust'
  | 'trust'
  | 'fair'
  | 'distrust'
  | 'high_distrust'
  | 'super_distrust';

export type StanceReason =
  | 'manual'
  | 'taste_match'
  | 'taste_mismatch'
  | 'suspected_ad'
  | 'other';

export type Platform =
  | 'instagram'
  | 'threads'
  | 'youtube'
  | 'xiaohongshu'
  | 'x'
  | 'tabelog'
  | 'blog'
  | 'other';

/** 權重同名額 —— 真值嚟自 DB 嘅 stance_weight 表,呢度只係 fallback。 */
export const TIERS: {
  tier: StanceTier;
  label: string;
  weight: number;
  quota: number | null;
}[] = [
  { tier: 'super_trust',    label: '超級白名單', weight:  10, quota: 5    },
  { tier: 'high_trust',     label: '高級白名單', weight:   5, quota: 20   },
  { tier: 'trust',          label: '白名單',     weight:   1, quota: null },
  { tier: 'fair',           label: '一般',       weight:   0, quota: null },
  { tier: 'distrust',       label: '黑名單',     weight:  -1, quota: null },
  { tier: 'high_distrust',  label: '高級黑名單', weight:  -5, quota: 20   },
  { tier: 'super_distrust', label: '超級黑名單', weight: -10, quota: 5    },
];

export const tierInfo = (t: StanceTier) => TIERS.find((x) => x.tier === t)!;

/** DB 名額 trigger 嘅訊息帶住內部 enum 名,顯示前譯返中文。 */
export function tierError(e: unknown): string {
  let msg = (e as { message?: string })?.message ?? String(e);
  // 由長到短換:否則 super_distrust 會先中 trust
  for (const t of [...TIERS].sort((a, b) => b.tier.length - a.tier.length)) {
    msg = msg.replace(t.tier, t.label);
  }
  return msg;
}

/** 五檔評價尺 —— 用戶評分同 LLM 抽取共用,唔同尺就冇得計相關性。 */
export const SENTIMENT_SCALE = [
  { score:  1.0, label: '勁正', stars: 5 },
  { score:  0.5, label: '唔錯', stars: 4 },
  { score:  0.0, label: '一般', stars: 3 },
  { score: -0.5, label: '麻麻', stars: 2 },
  { score: -1.0, label: '伏',   stars: 1 },
] as const;

export interface Restaurant {
  id: string;
  name: string;
  name_local: string | null;
  address: string | null;
  country_code: string;
  cuisine: string[] | null;
}

/** 下架請求表格 —— 只寫得,寫完讀唔返(連提交者都讀唔到) */
export interface TakedownInput {
  claimant_name: string;
  claimant_contact: string;
  claim: string;
  mention_id?: string | null;
  subject_foodie_id?: string | null;
}

/** nearby_with_score() 嘅一行 */
export interface ScoredRestaurant {
  restaurant_id: string;
  name: string;
  lng: number;
  lat: number;
  distance_m: number;
  score: number;
  score_norm: number | null;
  n_signal: number;
  trusted_pos: number;
  trusted_neg: number;
  distrusted_pos: number;
  distrusted_neg: number;
  unknown_pos: number;
}

/** taste_match_foodies() 嘅一行 */
export interface TasteMatch {
  foodie_id: string;
  sim: number;
  sim_shrunk: number;
  n_overlap: number;
  suggested_tier: StanceTier;
  reason: StanceReason;
}

export interface Foodie {
  id: string;
  display_name: string;
  primary_market: string | null;
  accounts?: { platform: Platform; handle: string; url: string | null; follower_count: number | null }[];
  stance?: { tier: StanceTier; reason: StanceReason } | null;
}

export interface MentionDetail {
  id: string;
  sentiment_score: number;
  /** 抽取器信心：「呢串字似唔似店名」。唔會乘入評分。 */
  extract_confidence: number;
  /** 配對器信心：「配到嘅係唔係嗰間」。呢個先係乘入評分嗰個。 */
  match_confidence: number;
  is_disclosed_ad: boolean;
  posted_at: string | null;
  post_url: string;
  foodie_id: string;
  foodie_name: string;
  platform: Platform;
  handle: string;
  tier: StanceTier | null;
}
