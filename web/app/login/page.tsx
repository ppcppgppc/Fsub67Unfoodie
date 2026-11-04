'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';

// 示範帳號只可以喺本機預填。production bundle 入面唔應該有呢組字。
const DEV = process.env.NODE_ENV === 'development';

export default function Login() {
  const router = useRouter();
  const userId = useUser();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(DEV ? 'demo@unfoodie.local' : '');
  const [pw, setPw] = useState(DEV ? 'demo1234' : '');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 已經登入就唔使喺度
  useEffect(() => { if (userId) router.replace('/'); }, [userId, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setNote(null);
    try {
      if (mode === 'in') {
        const { error } = await db().auth.signInWithPassword({ email, password: pw });
        if (error) setErr(error.message);
        else router.replace('/');
        return;
      }
      const { data, error } = await db().auth.signUp({
        email,
        password: pw,
        // 確認信條 link 返去而家呢個網域,唔靠 Supabase 嘅 Site URL 設定
        options: { emailRedirectTo: location.origin },
      });
      if (error) setErr(error.message);
      else if (data.session) router.replace('/');
      else setNote('已經寄咗確認信，撳信入面條 link 就可以登入。');
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    setMode(mode === 'in' ? 'up' : 'in');
    setErr(null); setNote(null);
  }

  return (
    <div className="narrow">
      <h1>{mode === 'in' ? '登入' : '註冊'}</h1>
      <p className="sub">你嘅信任名單只屬於你，其他用戶讀唔到。</p>
      <form onSubmit={submit} className="form">
        <label>
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
                 type="email" required autoComplete="email" />
        </label>
        <label>
          <span>密碼</span>
          <input value={pw} onChange={(e) => setPw(e.target.value)}
                 type="password" required minLength={8} placeholder="最少 8 個字"
                 autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        </label>
        {err && <div className="err" role="alert">{err}</div>}
        {note && <div className="ok" role="status">{note}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? '處理緊…' : mode === 'in' ? '登入' : '註冊'}
        </button>
      </form>
      <p className="muted center">
        <button className="link" type="button" onClick={toggle}>
          {mode === 'in' ? '未有帳號？註冊' : '已經有帳號？登入'}
        </button>
      </p>
    </div>
  );
}
