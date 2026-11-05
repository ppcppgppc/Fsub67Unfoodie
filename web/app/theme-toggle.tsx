'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_THEME, getThemePref, setThemePref, type ThemePref } from '@/lib/theme';
import { IconAuto, IconMoon, IconSun } from '@/lib/icons';

const NEXT: Record<ThemePref, ThemePref> = { dark: 'light', light: 'system', system: 'dark' };
const LABEL: Record<ThemePref, string> = { system: '跟系統', light: '淺色', dark: '深色' };
const ICON = { system: IconAuto, light: IconSun, dark: IconMoon };

/** 撳一下轉:深色 → 淺色 → 跟系統 */
export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(DEFAULT_THEME);
  useEffect(() => setPref(getThemePref()), []);
  const Icon = ICON[pref];
  return (
    <button
      type="button" className="side-item theme-btn"
      onClick={() => { const n = NEXT[pref]; setThemePref(n); setPref(n); }}
      aria-label={`外觀：${LABEL[pref]}（撳一下轉）`}
      title={`外觀：${LABEL[pref]}`}
    >
      <Icon size={18} /><span>外觀：{LABEL[pref]}</span>
    </button>
  );
}
