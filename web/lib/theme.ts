'use client';

// 外觀:跟系統 / 淺色 / 深色。揀咗就記喺呢部機(localStorage)。
// <html data-theme> 冇設 = 跟系統;CSS 同地圖都睇呢個。

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'unfoodie.theme';
export const THEME_EVENT = 'unfoodie-theme';

/** 放喺 <head>,喺畫面出嚟之前設好,唔會閃一下白色 */
export const THEME_BOOT =
  `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export function getThemePref(): ThemePref {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function setThemePref(t: ThemePref) {
  const el = document.documentElement;
  if (t === 'system') delete el.dataset.theme;
  else el.dataset.theme = t;
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* 私密模式:今次有效,唔記得 */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** 而家實際係咪深色(考慮埋跟系統) */
export function isDark(): boolean {
  if (typeof document === 'undefined') return false;
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}
