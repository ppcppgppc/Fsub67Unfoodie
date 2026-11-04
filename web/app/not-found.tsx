import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="narrow center">
      <h1>搵唔到呢頁</h1>
      <p className="sub">可能條 link 錯咗，或者間舖已經唔喺資料庫。</p>
      <p style={{ marginTop: 20 }}><Link href="/" className="btn ghost">返探索</Link></p>
    </div>
  );
}
