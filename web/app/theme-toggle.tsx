'use client';

import { useEffect, useState } from 'react';
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme';
import { IconAuto, IconMoon, IconSun } from '@/lib/icons';

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemePref, string> = { system: '跟系統', light: '淺色', dark: '深色' };
const ICON = { system: IconAuto, light: IconSun, dark: IconMoon };

/** 撳一下轉:跟系統 → 淺色 → 深色 */
export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>('system');
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
