'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db, useUser } from '@/lib/db';

export default function Nav() {
  const path = usePathname();
  const userId = useUser();
  const on = (p: string) => (path === p ? 'on' : '');

  return (
    <header className="top">
      <div className="top-inner">
        <Link href="/" className="brand">UNFOODIE<span> ±</span></Link>
        <nav className="top-nav">
          <Link href="/" className={on('/')}>探索</Link>
          <Link href="/foodies" className={on('/foodies')}>食評人</Link>
          {userId ? (
            <a href="#" onClick={async (e) => { e.preventDefault(); await db().auth.signOut(); location.href = '/'; }}>
              登出
            </a>
          ) : (
            <Link href="/login" className={on('/login')}>登入</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
