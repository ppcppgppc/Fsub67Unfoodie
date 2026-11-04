'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { IconLogout, IconMap, IconPeople, IconPerson } from '@/lib/icons';

/** 浮喺頂嘅玻璃膠囊導航(Liquid Glass) */
export default function Nav() {
  const path = usePathname();
  const userId = useUser();
  const isOn = (p: string) => (p === '/' ? path === '/' || path.startsWith('/r/') : path.startsWith(p));

  async function signOut() {
    await db().auth.signOut();
    location.href = '/';
  }

  return (
    <header className="top">
      <Link href="/" className="brand" aria-label="UNFOODIE 主頁">UNFOODIE<span>±</span></Link>
      <nav className="tabs glass" aria-label="主選單">
        <Link href="/" className={`tab ${isOn('/') ? 'on' : ''}`} aria-current={isOn('/') ? 'page' : undefined}>
          <IconMap size={18} /><span>探索</span>
        </Link>
        <Link href="/foodies" className={`tab ${isOn('/foodies') ? 'on' : ''}`} aria-current={isOn('/foodies') ? 'page' : undefined}>
          <IconPeople size={18} /><span>食評人</span>
        </Link>
        {userId ? (
          <button type="button" className="tab" onClick={signOut}>
            <IconLogout size={18} /><span>登出</span>
          </button>
        ) : (
          <Link href="/login" className={`tab ${isOn('/login') ? 'on' : ''}`}>
            <IconPerson size={18} /><span>登入</span>
          </Link>
        )}
      </nav>
    </header>
  );
}
