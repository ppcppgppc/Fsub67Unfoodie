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
        <Nav />
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
