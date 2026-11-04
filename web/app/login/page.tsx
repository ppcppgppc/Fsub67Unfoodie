'use client';

import { useState } from 'react';
import { db } from '@/lib/db';

// 示範帳號只可以喺本機預填。production bundle 入面唔應該有呢組字。
const DEV = process.env.NODE_ENV === 'development';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(DEV ? 'demo@unfoodie.local' : '');
  const [pw, setPw] = useState(DEV ? 'demo1234' : '');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setNote(null);
    if (mode === 'in') {
      const { error } = await db().auth.signInWithPassword({ email, password: pw });
      setBusy(false);
      if (error) setErr(error.message);
      else location.href = '/';
      return;
    }
    const { data, error } = await db().auth.signUp({ email, password: pw });
    setBusy(false);
    if (error) setErr(error.message);
    else if (data.session) location.href = '/';
    else setNote('已經寄咗確認信,撳信入面條 link 就可以登入。');
  }

  return (
    <div className="login">
      <h1>{mode === 'in' ? '登入' : '註冊'}</h1>
      <p className="sub">你嘅信任名單只屬於你,其他用戶讀唔到。</p>
      <form onSubmit={submit} style={{ marginTop: 20 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)}
               type="email" required autoComplete="email" placeholder="email" />
        <input value={pw} onChange={(e) => setPw(e.target.value)}
               type="password" required minLength={8} placeholder="密碼(最少 8 個字)"
               autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        {err && <div className="err">{err}</div>}
        {note && <div className="ok">{note}</div>}
        <button className="primary" disabled={busy}>
          {busy ? '…' : mode === 'in' ? '登入' : '註冊'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 14, textAlign: 'center' }}>
        <button className="link" type="button"
                onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(null); setNote(null); }}>
          {mode === 'in' ? '未有帳號?註冊' : '已經有帳號?登入'}
        </button>
      </p>
    </div>
  );
}
