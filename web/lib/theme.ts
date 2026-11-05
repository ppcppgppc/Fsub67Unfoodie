'use client';

// 外觀:深色(預設)/ 淺色 / 跟系統。揀咗淺色或者跟系統就記喺呢部機。
// <html data-theme>:dark / light;冇設 = 跟系統。CSS 同地圖都睇呢個。

export type ThemePref = 'dark' | 'light' | 'system';
const KEY = 'unfoodie.theme';
export const THEME_EVENT = 'unfoodie-theme';
export const DEFAULT_THEME = 'dark' as const;

/**
 * 放喺 <head>,喺畫面出嚟之前改返用戶揀嘅外觀。
 * HTML 本身已經係 data-theme="dark",所以預設情況乜都唔使做,唔會閃。
 */
export const THEME_BOOT =
  `try{var t=localStorage.getItem('${KEY}'),d=document.documentElement;` +
  `if(t==='light')d.dataset.theme='light';else if(t==='system')delete d.dataset.theme}catch(e){}`;

export function getThemePref(): ThemePref {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'system' ? t : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function setThemePref(t: ThemePref) {
  const el = document.documentElement;
  if (t === 'system') delete el.dataset.theme;
  else el.dataset.theme = t;
  try {
    // 預設值唔使記
    if (t === DEFAULT_THEME) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* 私密模式:今次有效,唔記得 */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** 而家實際係咪深色(考慮埋跟系統) */
export function isDark(): boolean {
  if (typeof document === 'undefined') return true;
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}
