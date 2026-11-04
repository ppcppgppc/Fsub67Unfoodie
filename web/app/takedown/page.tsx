'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/db';
import { errMsg } from '@/lib/format';
import { mentionSummary, submitTakedown } from '@unfoodie/core';

// 同 migration 12 嘅 check constraint 一致
const MAX = { name: 200, contact: 300, claim: 5000 } as const;

const ROLES = [
  { v: 'foodie',     label: '我係內容嘅食評人本人' },
  { v: 'restaurant', label: '我代表被提及嘅餐廳' },
  { v: 'mismatch',   label: '配錯咗餐廳／內容有誤' },
  { v: 'other',      label: '其他' },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Summary = Awaited<ReturnType<typeof mentionSummary>>;

export default function TakedownPage() {
  // useSearchParams 喺 build 時要包 Suspense
  return (
    <Suspense fallback={<p className="empty">載入中…</p>}>
      <Takedown />
    </Suspense>
  );
}

function Takedown() {
  const params = useSearchParams();
  const raw = params.get('mention');
  const mentionId = raw && UUID.test(raw) ? raw : null;

  const [target, setTarget] = useState<Summary>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [role, setRole] = useState<string>(ROLES[0].v);
  const [claim, setClaim] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!mentionId) return;
    mentionSummary(db(), mentionId).then(setTarget).catch(() => setTarget(null));
  }, [mentionId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const roleLabel = ROLES.find((r) => r.v === role)?.label ?? role;
    try {
      await submitTakedown(db(), {
        claimant_name: name,
        claimant_contact: contact,
        // 冇獨立 column 放身分,放喺內文第一行,審核時一眼睇到
        claim: `【${roleLabel}】\n${claim}`.slice(0, MAX.claim),
        mention_id: target?.mention_id ?? null,
        subject_foodie_id: target?.foodie_id ?? null,
      });
      setDone(true);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="narrow">
        <h1>收到</h1>
        <div className="ok" role="status">
          我哋已經收到你嘅請求，會喺 48 小時內用你留低嘅聯絡方法回覆。
        </div>
        <p className="muted">
          為咗保障投訴人，提交咗嘅內容連你自己都睇唔返，亦唔會公開。
          如果要補充資料，請再交一次並喺內文註明。
        </p>
        <p><Link href="/" className="btn ghost">返主頁</Link></p>
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1>要求下架</h1>
      <p className="sub">唔使登入。我哋會喺 48 小時內回覆。</p>

      <div className="policy">
        <p>適用於：你係被提及嘅食評人或者餐廳，或者有內容配錯咗舖、講錯咗嘢。</p>
        <p>我哋會覆核相關內容；處理期間可能會先暫停顯示。每個步驟都有紀錄。</p>
        <p>你嘅聯絡資料只用嚟回覆呢個請求，唔會公開，亦唔會轉交被投訴嘅一方。</p>
      </div>

      {target && (
        <div className="target">
          <span className="muted">你要求處理嘅內容</span>
          <div><b>{target.foodie_name}</b> 對 <b>{target.restaurant_name}</b> 嘅評論</div>
        </div>
      )}
      {raw && !mentionId && (
        <div className="err">條 link 帶住嘅內容編號唔啱格式。你照樣可以提交，請喺內文寫清楚係邊篇。</div>
      )}

      <form onSubmit={submit} className="form">
        <label>
          <span>你嘅名稱 *</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
                 required maxLength={MAX.name} autoComplete="name" />
        </label>
        <label>
          <span>聯絡方法（email 或電話）*</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)}
                 required minLength={3} maxLength={MAX.contact} autoComplete="email" />
        </label>
        <label>
          <span>你嘅身分</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
        </label>
        <label>
          <span>請說明 *</span>
          <textarea value={claim} onChange={(e) => setClaim(e.target.value)}
                    required rows={6} maxLength={MAX.claim - 40}
                    placeholder={target ? '邊度有問題？想我哋點處理？' : '請貼上相關頁面嘅 link，再講講邊度有問題、想我哋點處理。'} />
        </label>
        {err && <div className="err" role="alert">提交唔到：{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? '提交緊…' : '提交'}</button>
      </form>
    </div>
  );
}
