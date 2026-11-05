// 顯示用嘅細工具 —— web 同 app 共用,所以唔可以有平台專屬嘅嘢。

/** +1.5 / −2 / 0 —— 正數一定帶 +,唔係會同負數撈亂;負號用真正嘅減號 */
export function signed(n: number, digits = 0): string {
  if (n === 0) return '0';
  const s = Math.abs(n).toFixed(digits);
  return n > 0 ? `+${s}` : `−${s}`;
}

/** 正 / 負 / 零 → 語意色調,web 同 app 各自 map 去 class 或者色 */
export const toneOf = (n: number): 'good' | 'bad' | 'neutral' =>
  n > 0 ? 'good' : n < 0 ? 'bad' : 'neutral';

/** 外部連結嚟自 ingest,只准 http(s),擋住 javascript: 之類 */
export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null;
  } catch {
    return null;
  }
}

export const errMsg = (e: unknown): string =>
  (e as { message?: string })?.message ?? String(e);

/** 探索頁嘅地區 —— 未有定位之前用住先 */
export const EXPLORE_SPOTS = [
  { name: '旺角',   lat: 22.3193, lng: 114.1694 },
  { name: '中環',   lat: 22.2819, lng: 114.1582 },
  { name: '深水埗', lat: 22.3303, lng: 114.1622 },
  { name: '銅鑼灣', lat: 22.2800, lng: 114.1846 },
  { name: '渋谷',   lat: 35.6595, lng: 139.7005 },
  { name: '銀座',   lat: 35.6717, lng: 139.7650 },
] as const;

/** 探索頁搵幾遠 */
export const EXPLORE_RADIUS_M = 3000;
