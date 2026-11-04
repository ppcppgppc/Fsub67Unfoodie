'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';

export default function Nav() {
  const path = usePathname();
  const userId = useUser();
  // 餐廳詳情頁都算「探索」底下
  const on = (p: string) =>
    (p === '/' ? path === '/' || path.startsWith('/r/') : path.startsWith(p)) ? 'on' : '';

  async function signOut() {
    await db().auth.signOut();
    location.href = '/';
  }

  return (
    <header className="top">
      <div className="top-inner">
        <Link href="/" className="brand">UNFOODIE<span> ±</span></Link>
        <nav className="top-nav">
          <Link href="/" className={on('/')}>探索</Link>
          <Link href="/foodies" className={on('/foodies')}>食評人</Link>
          {userId ? (
            <button type="button" className="nav-btn" onClick={signOut}>登出</button>
          ) : (
            <Link href="/login" className={on('/login')}>登入</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
