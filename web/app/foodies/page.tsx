'use client';

import { useCallback, useEffect, useState } from 'react';
import { db, useUser } from '@/lib/db';
import {
  listFoodies, setStance, tasteMatchFoodies, TIERS, tierInfo,
  type Foodie, type StanceTier, type TasteMatch,
} from '@unfoodie/core';

export default function Foodies() {
  const userId = useUser();
  const [rows, setRows] = useState<Foodie[] | null>(null);
  const [matches, setMatches] = useState<TasteMatch[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [f, m] = await Promise.all([
      listFoodies(db(), userId),
      tasteMatchFoodies(db(), userId, 2).catch(() => []),
    ]);
    setRows(f);
    setMatches(m);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (userId === undefined) return <p className="empty">…</p>;
  if (userId === null) return <p className="empty">要登入先</p>;
  if (!rows) return <p className="empty">…</p>;

  const used = (t: StanceTier) => rows.filter((f) => f.stance?.tier === t).length;
  const matchOf = (id: string) => matches.find((m) => m.foodie_id === id);

  async function change(foodieId: string, tier: string) {
    setErr(null);
    try {
      await setStance(db(), userId!, foodieId, tier === '' ? null : (tier as StanceTier));
      await load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  return (
    <>
      <h1>食評人</h1>
      <p className="sub">預設值係零。信任要你自己畀 —— 而上下兩極有名額。</p>

      <div className="bar">
        {TIERS.filter((t) => t.quota !== null).map((t) => (
          <span key={t.tier} className="quota">
            {t.label} {used(t.tier)}/{t.quota}
          </span>
        ))}
      </div>

      {err && <div className="err">{err}</div>}

      {rows.map((f) => {
        const st = f.stance?.tier ?? null;
        const w = st ? tierInfo(st).weight : 0;
        const acc = f.accounts?.[0];
        const mt = matchOf(f.id);
        return (
          <div className="frow" key={f.id}>
            <div className="who">
              <div className="nm">{f.display_name}</div>
              <div className="hd">
                {acc ? `${acc.platform} · @${acc.handle}` : '—'}
                {f.stance?.reason === 'taste_mismatch' && ' · 口味相反'}
              </div>
              {mt && !st && (
                <div className="hd" style={{ marginTop: 3 }}>
                  口味{mt.sim >= 0 ? '相近' : '相反'} {mt.sim.toFixed(2)}
                  （重疊 {mt.n_overlap} 間）→ 建議 {tierInfo(mt.suggested_tier).label}
                </div>
              )}
            </div>
            <div className="act">
              <span className={`wt ${w > 0 ? 't-good' : w < 0 ? 't-bad' : 't-dim'}`}>
                {w > 0 ? `+${w}` : w}
              </span>
              <select value={st ?? ''} onChange={(e) => change(f.id, e.target.value)}>
                <option value="">未評</option>
                {TIERS.map((t) => (
                  <option key={t.tier} value={t.tier}>
                    {t.label} ({t.weight > 0 ? '+' : ''}{t.weight})
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}

      <h2>點解要有名額</h2>
      <p className="muted">
        冇名額限制嘅話,三個月後你會有四十個超級白名單,個 scale 就塌返做 ±1,加權等於白做。
        建議永遠只係建議 —— 要你撳實先入名單。
      </p>
    </>
  );
}
