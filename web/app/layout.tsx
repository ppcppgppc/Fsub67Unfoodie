import './globals.css';
import '@fontsource-variable/source-serif-4';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import Nav from './nav';
import { UserProvider } from '@/lib/user';
import { THEME_BOOT } from '@/lib/theme';

export const metadata: Metadata = {
  title: { default: 'UNFOODIE', template: '%s · UNFOODIE' },
  description: '唔收廣告嘅食評。你唔使判斷邊間舖好食 —— 你只需要判斷你信邊個。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f5' },
    { media: '(prefers-color-scheme: dark)', color: '#262624' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning:data-theme 由下面段 script 喺 React 之前設
    <html lang="zh-HK" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <UserProvider>
          <div className="app">
            <Nav />
            <div className="main">
              <main className="wrap">{children}</main>
              <footer className="foot">
                唔收廣告 · 唔收費 · 唔賣排名
                <span className="foot-links">
                  <Link href="/takedown">要求下架</Link>
                  <a href="https://github.com/ppcppgppc/Fsub67Unfoodie">原始碼</a>
                </span>
              </footer>
            </div>
          </div>
        </UserProvider>
      </body>
    </html>
  );
}
