'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { errMsg, signed, toneClass } from '@/lib/format';
import {
  listFoodies, setStance, tasteMatchFoodies, TIERS, tierInfo, tierError,
  type Foodie, type StanceReason, type StanceTier, type TasteMatch,
} from '@unfoodie/core';

export default function Foodies() {
  const userId = useUser();
  const [rows, setRows] = useState<Foodie[] | null>(null);
  const [matches, setMatches] = useState<TasteMatch[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [f, m] = await Promise.all([
        listFoodies(db(), userId),
        // 配對建議係錦上添花,失敗都唔好擋住成頁
        tasteMatchFoodies(db(), userId, 2).catch(() => [] as TasteMatch[]),
      ]);
      setRows(f);
      setMatches(m);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (userId === undefined) return <p className="empty">載入中…</p>;
  if (userId === null) return <p className="empty">要<Link href="/login">登入</Link>先可以管理你嘅名單</p>;
  if (!rows) return err ? <div className="err">{err}</div> : <p className="empty">載入中…</p>;

  const used = (t: StanceTier) => rows.filter((f) => f.stance?.tier === t).length;
  const matchOf = (id: string) => matches.find((m) => m.foodie_id === id);

  async function change(foodieId: string, tier: StanceTier | null, reason: StanceReason = 'manual') {
    setErr(null);
    setBusy(foodieId);
    try {
      await setStance(db(), userId!, foodieId, tier, reason);
      await load();
    } catch (e) {
      setErr(tierError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1>食評人</h1>
      <p className="sub">預設值係零。信任要你自己畀 —— 而上下兩極有名額。</p>

      <div className="quotas">
        {TIERS.filter((t) => t.quota !== null).map((t) => {
          const n = used(t.tier);
          return (
            <span key={t.tier} className={`quota ${n >= t.quota! ? 'full' : ''}`}>
              {t.label} <b>{n}/{t.quota}</b>
            </span>
          );
        })}
      </div>

      {err && <div className="err" role="alert">{err}</div>}

      <h2>你嘅名單</h2>
      <div className="group">
      {rows.map((f) => {
        const st = f.stance?.tier ?? null;
        const w = st ? tierInfo(st).weight : 0;
        const acc = f.accounts?.[0];
        const mt = matchOf(f.id);
        return (
          <div className="frow" key={f.id} aria-busy={busy === f.id}>
            <div className="who">
              <div className="nm">{f.display_name}</div>
              <div className="hd">
                {acc ? `${acc.platform} · @${acc.handle}` : '—'}
                {f.stance?.reason === 'taste_mismatch' && ' · 口味相反'}
              </div>
            </div>
            <div className="act">
              <span className={`wt ${toneClass(w)}`}>{signed(w)}</span>
              <select
                value={st ?? ''}
                disabled={busy === f.id}
                aria-label={`${f.display_name} 嘅信任等級`}
                onChange={(e) => change(f.id, e.target.value === '' ? null : (e.target.value as StanceTier))}
              >
                <option value="">未評</option>
                {TIERS.map((t) => (
                  <option key={t.tier} value={t.tier}>
                    {t.label}（{signed(t.weight)}）
                  </option>
                ))}
              </select>
            </div>
            {mt && !st && (
              <div className="suggest">
                <span>
                  口味{mt.sim >= 0 ? '相近' : '相反'} <b>{mt.sim.toFixed(2)}</b>
                  （重疊 {mt.n_overlap} 間）→ 建議 <b>{tierInfo(mt.suggested_tier).label}</b>
                </span>
                <button
                  type="button" className="btn ghost sm" disabled={busy === f.id}
                  onClick={() => change(f.id, mt.suggested_tier, mt.reason)}
                >採納</button>
              </div>
            )}
          </div>
        );
      })}
      </div>

      <h2>點解要有名額</h2>
      <p className="muted">
        冇名額限制嘅話，三個月後你會有四十個超級白名單，個 scale 就塌返做 ±1，加權等於白做。
        口味配對嘅建議永遠只係建議 —— 要你撳「採納」先入名單。
      </p>
    </>
  );
}
