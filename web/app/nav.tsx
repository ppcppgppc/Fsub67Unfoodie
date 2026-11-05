'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { IconLogout, IconMap, IconPeople, IconPerson } from '@/lib/icons';
import ThemeToggle from './theme-toggle';

/** 桌面 = 左邊 sidebar;手機 = 頂部細 bar */
export default function Nav() {
  const path = usePathname();
  const userId = useUser();
  const isOn = (p: string) => (p === '/' ? path === '/' || path.startsWith('/r/') : path.startsWith(p));

  async function signOut() {
    await db().auth.signOut();
    location.href = '/';
  }

  return (
    <aside className="side">
      <Link href="/" className="brand" aria-label="UNFOODIE 主頁">
        <span className="brand-mark" aria-hidden="true">±</span>
        <span className="brand-name">Unfoodie</span>
      </Link>

      <nav className="side-nav" aria-label="主選單">
        <Link href="/" className={`side-item ${isOn('/') ? 'on' : ''}`} aria-current={isOn('/') ? 'page' : undefined}>
          <IconMap size={18} /><span>探索</span>
        </Link>
        <Link href="/foodies" className={`side-item ${isOn('/foodies') ? 'on' : ''}`} aria-current={isOn('/foodies') ? 'page' : undefined}>
          <IconPeople size={18} /><span>食評人</span>
        </Link>
      </nav>

      <div className="side-foot">
        <p className="side-note">示範版：食評人同餐廳全部虛構。</p>
        <ThemeToggle />
        {userId ? (
          <button type="button" className="side-item" onClick={signOut}>
            <IconLogout size={18} /><span>登出</span>
          </button>
        ) : (
          <Link href="/login" className={`side-item ${isOn('/login') ? 'on' : ''}`}>
            <IconPerson size={18} /><span>登入</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
