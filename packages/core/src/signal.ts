// UNFOODIE — 將四象限 count 譯成人睇得明嘅訊號
//
// 呢個檔案係成個 app 嘅論點所在。分數負責排序,呢度負責解釋。
// 一個數字冇人信;「3 個你信嘅人讚 · 1 個你唔信嘅人讚」一睇就明。

import { tierInfo, type ScoredRestaurant, type MentionDetail } from './types';

export type SignalKind =
  | 'recommended'  // 你信嘅人讚過
  | 'suspect'      // 淨係得你唔信嘅人讚過  ← 成個 app 嘅賣點
  | 'avoid'        // 你信嘅人彈過
  | 'contrarian'   // 你唔信嘅人彈過 → 反而值得試
  | 'unknown';     // 你名單入面冇人講過

export interface Signal {
  kind: SignalKind;
  label: string;
  detail: string;
  /** 語意色,唔好硬編喺 component 度 */
  tone: 'good' | 'bad' | 'warn' | 'neutral';
}

export function classify(r: ScoredRestaurant): Signal {
  const { trusted_pos, trusted_neg, distrusted_pos, distrusted_neg, unknown_pos, score } = r;

  // 「避」要排喺「可疑」前面:你信嘅人彈過係更直接嘅證據。
  // 如果倒轉,「2 個你信嘅人彈 + 1 個你唔信嘅人讚」會淨係顯示「可疑」,
  // 而嗰兩個你信嘅劣評就收埋咗。
  if (trusted_neg > 0 && score < 0) {
    const bits = [`${trusted_neg} 個你信嘅人彈過`];
    // 有信任嘅人彈、同時得鱔稿號讚 —— 後者先係更加難聽嗰半邊,唔好收埋
    if (distrusted_pos > 0) bits.push(`${distrusted_pos} 個你唔信嘅人讚`);
    return { kind: 'avoid', label: '避', detail: bits.join(' · '), tone: 'bad' };
  }

  // 賣點:淨係得黑名單嗰班人讚過。冇任何平台會話你聽呢件事,
  // 因為所有平台嘅收入都嚟自嗰班人。
  if (distrusted_pos > 0 && trusted_pos === 0) {
    return {
      kind: 'suspect',
      label: '可疑',
      detail: `淨係得 ${distrusted_pos} 個你唔信嘅人讚過`,
      tone: 'bad',
    };
  }

  if (trusted_pos > 0) {
    const bits = [`${trusted_pos} 個你信嘅人讚`];
    if (distrusted_pos > 0) bits.push(`${distrusted_pos} 個你唔信嘅人都讚`);
    if (trusted_neg > 0) bits.push(`${trusted_neg} 個你信嘅人彈`);
    return {
      kind: 'recommended',
      label: '推薦',
      detail: bits.join(' · '),
      tone: 'good',
    };
  }

  // 冇人俾錢一個 KOL 去彈嘢,所以佢嘅劣評特別可信。
  if (distrusted_neg > 0 && score > 0) {
    return {
      kind: 'contrarian',
      label: '反而值得試',
      detail: `${distrusted_neg} 個你唔信嘅人彈過`,
      tone: 'warn',
    };
  }

  return {
    kind: 'unknown',
    label: '未知',
    detail: unknown_pos > 0
      ? `${unknown_pos} 個你未評過嘅人講過`
      : '你名單入面冇人講過',
    tone: 'neutral',
  };
}

/**
 * 排序用嘅顯示分數。
 * score_norm 係加權平均(同 post 數量無關),但樣本太細嘅平均數唔可信,
 * 所以少過 3 個訊號就唔顯示 —— 同 SQL 側嘅排序邏輯保持一致。
 */
export function displayScore(r: ScoredRestaurant): number | null {
  return r.n_signal >= 3 && r.score_norm !== null ? r.score_norm : null;
}

/** 必須同 nearby_with_score() 嘅預設參數一致(migration 11) */
export const SCORING = { minMatch: 0.5, halfLifeDays: 548 } as const;

export type Contribution =
  | { counted: true; value: number; weight: number; k: number }
  | { counted: false; reason: string };

/**
 * 一條 mention 對呢間舖分數嘅貢獻 = 權重 × 評價 × 配對信心 × 時間衰減。
 * 同 SQL 一樣:申報合作、冇日期、配對信心太低嘅唔計。
 * 詳情頁要顯示呢個,而唔係淨係「權重 × 評價」,否則同排序對唔上。
 */
export function contribution(
  m: Pick<MentionDetail, 'tier' | 'sentiment_score' | 'match_confidence' | 'is_disclosed_ad' | 'posted_at'>,
  now = Date.now(),
): Contribution {
  if (m.is_disclosed_ad) return { counted: false, reason: '申報咗合作，唔計分' };
  if (!m.posted_at) return { counted: false, reason: '冇發佈日期，唔計分' };
  if (m.match_confidence < SCORING.minMatch) return { counted: false, reason: '配對信心太低，唔計分' };

  const weight = m.tier ? tierInfo(m.tier).weight : 0;
  const ageDays = Math.max(0, (now - Date.parse(m.posted_at)) / 864e5);
  const k = m.match_confidence * Math.pow(0.5, ageDays / SCORING.halfLifeDays);
  return { counted: true, value: weight * m.sentiment_score * k, weight, k };
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}
