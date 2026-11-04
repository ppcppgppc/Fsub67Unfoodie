import { useColorScheme } from 'react-native';
import { toneOf } from '@unfoodie/core';

// 同 web/app/globals.css 保持一致
const light = {
  bg: '#fbfaf8', surface: '#ffffff', line: '#e4e0d9',
  ink: '#16150f', inkSoft: '#6b675d', inkFaint: '#8a867b',
  good: '#16794a', goodBg: '#e6f4ec',
  bad: '#b3261e', badBg: '#fbeae9',
  warn: '#8a5a00', warnBg: '#fdf1dc',
  neutralBg: '#f1efea',
};

const dark: typeof light = {
  bg: '#121110', surface: '#1b1a18', line: '#2f2d29',
  ink: '#f2efe8', inkSoft: '#a5a096', inkFaint: '#7d796f',
  good: '#5fd39b', goodBg: '#12291f',
  bad: '#ff8a80', badBg: '#2e1614',
  warn: '#f0be62', warnBg: '#2b2013',
  neutralBg: '#242320',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

export const toneColor = (t: Theme, tone: 'good' | 'bad' | 'warn' | 'neutral') =>
  tone === 'good' ? t.good : tone === 'bad' ? t.bad : tone === 'warn' ? t.warn : t.inkFaint;

export const toneBg = (t: Theme, tone: 'good' | 'bad' | 'warn' | 'neutral') =>
  tone === 'good' ? t.goodBg : tone === 'bad' ? t.badBg : tone === 'warn' ? t.warnBg : t.neutralBg;

/** 正數綠、負數紅、零灰 */
export const signColor = (t: Theme, n: number) => toneColor(t, toneOf(n));
