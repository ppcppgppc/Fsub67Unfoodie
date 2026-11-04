import './globals.css';
import type { Metadata } from 'next';
import Nav from './nav';

export const metadata: Metadata = {
  title: 'UNFOODIE',
  description: '唔收廣告嘅食評。你唔使判斷邊間舖好食 —— 你只需要判斷你信邊個。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>
        <div className="demo-banner">示範版:所有食評人同餐廳都係虛構資料,唔代表任何真人真舖。</div>
        <Nav />
        <main className="wrap">{children}</main>
        <footer className="foot">
          <a href="https://github.com/ppcppgppc/Fsub67Unfoodie">GitHub 原始碼</a>
          {' · '}唔收廣告 · 唔收費 · 唔賣排名
        </footer>
      </body>
    </html>
  );
}
