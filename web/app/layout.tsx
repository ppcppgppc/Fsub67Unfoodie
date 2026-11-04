import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import Nav from './nav';
import { UserProvider } from '@/lib/user';

export const metadata: Metadata = {
  title: { default: 'UNFOODIE', template: '%s · UNFOODIE' },
  description: '唔收廣告嘅食評。你唔使判斷邊間舖好食 —— 你只需要判斷你信邊個。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>
        <UserProvider>
          <Nav />
          <main className="wrap">{children}</main>
          <footer className="foot">
            <p className="demo-note">示範版：食評人同餐廳全部虛構，唔代表任何真人真舖。</p>
            <p>
              唔收廣告 · 唔收費 · 唔賣排名
              <span className="foot-links">
                <Link href="/takedown">要求下架</Link>
                <a href="https://github.com/ppcppgppc/Fsub67Unfoodie">原始碼</a>
              </span>
            </p>
          </footer>
        </UserProvider>
      </body>
    </html>
  );
}
