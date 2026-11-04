'use client';

import { useState } from 'react';
import { db } from '@/lib/db';

export default function Login() {
  const [email, setEmail] = useState('demo@unfoodie.local');
  const [pw, setPw] = useState('demo1234');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await db().auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr(error.message);
    else location.href = '/';
  }

  return (
    <div className="login">
      <h1>登入</h1>
      <p className="sub">你嘅信任名單只屬於你 —— 由 Postgres RLS 鎖死,唔會離開你個 account。</p>
      <form onSubmit={submit} style={{ marginTop: 20 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="密碼" />
        {err && <div className="err">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? '…' : '登入'}</button>
      </form>
    </div>
  );
}
