// 顯示用嘅細工具。唔放入 packages/core,因為 class 名係 web 專屬。

/** 正數綠、負數紅、零灰 */
export const toneClass = (n: number) => (n > 0 ? 't-good' : n < 0 ? 't-bad' : 't-dim');

/** +1.5 / −2 / 0 —— 正數一定帶 +,唔係會同負數撈亂 */
export function signed(n: number, digits = 0): string {
  if (n === 0) return '0';
  const s = Math.abs(n).toFixed(digits);
  return n > 0 ? `+${s}` : `−${s}`;
}

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

export const errMsg =(e: unknown) =>
  (e as { message?: string })?.message ?? String(e);
