import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toneOf } from '@unfoodie/core';

// Fsub 黑黃。數值同 Fsub00Shared/Design/fsub-design-tokens.json 一致,
// 亦同 web/app/globals.css 一致。預設深色。
//
// 黃色兩個用法:accent = 底色(一定配 onAccent 黑字);accentText = 做字用,
// 淺色模式係深金,因為亮黃喺白底上面睇唔清。

const light = {
  bg: '#fbfaf6', sidebar: '#f2f0e7', surface: '#ffffff', line: '#e7e4da', border: '#d9d6ca',
  ink: '#121211', inkSoft: '#55534d', inkFaint: '#8f8c83',
  accent: '#ffcf1a', onAccent: '#121211', accentText: '#7a5a00', accentSoft: 'rgba(255,207,26,0.22)',
  good: '#2f6d3a', goodFill: '#3f8a4c', goodBg: 'rgba(63,138,76,0.14)',
  bad: '#a8321f', badFill: '#c8402e', badBg: 'rgba(200,64,46,0.12)',
  warn: '#a8550c', warnFill: '#e07a1f', warnBg: 'rgba(224,122,31,0.14)',
  neutralBg: 'rgba(18,18,17,0.06)', quiet: '#a3a197',
  isDark: false,
};

const dark: typeof light = {
  bg: '#121211', sidebar: '#0a0a09', surface: '#1b1a18', line: '#292825', border: '#3a3935',
  ink: '#f6f4ec', inkSoft: '#b3b0a5', inkFaint: '#7d7a70',
  accent: '#ffd21f', onAccent: '#121211', accentText: '#ffd21f', accentSoft: 'rgba(255,210,31,0.13)',
  good: '#82d993', goodFill: '#6fcf82', goodBg: 'rgba(111,207,130,0.14)',
  bad: '#ff7f6c', badFill: '#ff6a55', badBg: 'rgba(255,106,85,0.14)',
  warn: '#ffab5e', warnFill: '#ff9b45', warnBg: 'rgba(255,155,69,0.14)',
  neutralBg: 'rgba(255,255,255,0.07)', quiet: '#75736b',
  isDark: true,
};

export type Theme = typeof light;

/** 標題、店名用 serif;中文會自動跌返系統字 */
export const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

/* ---------- 外觀:深色(預設)/ 淺色 / 跟系統 ---------- */

export type Appearance = 'dark' | 'light' | 'system';
const KEY = 'fsub.appearance'; // 同 Fsub Swift app 用同一個 key 名

const AppearanceContext = createContext<{ pref: Appearance; setPref: (a: Appearance) => void }>({
  pref: 'dark',
  setPref: () => {},
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<Appearance>('dark');
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'light' || v === 'system') setPrefState(v);
    }).catch(() => {});
  }, []);
  function setPref(a: Appearance) {
    setPrefState(a);
    (a === 'dark' ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, a)).catch(() => {});
  }
  return <AppearanceContext.Provider value={{ pref, setPref }}>{children}</AppearanceContext.Provider>;
}

export const useAppearance = () => useContext(AppearanceContext);

export function useTheme(): Theme {
  const { pref } = useAppearance();
  const system = useColorScheme();
  const isDark = pref === 'dark' || (pref === 'system' && system === 'dark');
  return isDark ? dark : light;
}

/* ---------- 訊號色 ---------- */

type Tone = 'good' | 'bad' | 'warn' | 'neutral';

/** 做字用 */
export const toneColor = (t: Theme, tone: Tone) =>
  tone === 'good' ? t.good : tone === 'bad' ? t.bad : tone === 'warn' ? t.warn : t.inkFaint;

/** 圓點、pin 嘅實色 */
export const toneFill = (t: Theme, tone: Tone) =>
  tone === 'good' ? t.goodFill : tone === 'bad' ? t.badFill : tone === 'warn' ? t.warnFill : t.quiet;

export const toneBg = (t: Theme, tone: Tone) =>
  tone === 'good' ? t.goodBg : tone === 'bad' ? t.badBg : tone === 'warn' ? t.warnBg : t.neutralBg;

/** 正數綠、負數紅、零灰 */
export const signColor = (t: Theme, n: number) => toneColor(t, toneOf(n));
