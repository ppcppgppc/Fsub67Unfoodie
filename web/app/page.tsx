'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { db, useUser } from '@/lib/db';
import {
  nearbyWithScore, classify, displayScore, formatDistance,
  type ScoredRestaurant,
} from '@unfoodie/core';

const Map = dynamic(() => import('./map'), { ssr: false });

const SPOTS = [
  { name: '旺角',   lat: 22.3193, lng: 114.1694 },
  { name: '中環',   lat: 22.2819, lng: 114.1582 },
  { name: '深水埗', lat: 22.3303, lng: 114.1622 },
  { name: '銅鑼灣', lat: 22.2800, lng: 114.1846 },
  { name: '渋谷',   lat: 35.6595, lng: 139.7005 },
  { name: '銀座',   lat: 35.6717, lng: 139.7650 },
];

export default function Explore() {
  const userId = useUser();
  const [spot, setSpot] = useState(0);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [rows, setRows] = useState<ScoredRestaurant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const s = SPOTS[spot];
    setRows(null); setErr(null);
    nearbyWithScore(db(), userId, s.lat, s.lng, 3000)
      .then(setRows)
      .catch((e) => setErr(e.message));
  }, [userId, spot]);

  if (userId === undefined) return <p className="empty">…</p>;
  if (userId === null) {
    return (
      <>
        <h1>UNFOODIE</h1>
        <p className="sub">你唔使判斷邊間舖好食 —— 你只需要判斷你信邊個。</p>
        <p style={{ marginTop: 24 }}><Link href="/login"><button className="primary">登入睇你嘅名單</button></Link></p>
      </>
    );
  }

  const s = SPOTS[spot];
  const withSignal = (rows ?? []).filter((r) => r.n_signal > 0);
  const noSignal   = (rows ?? []).filter((r) => r.n_signal === 0);

  return (
    <>
      <h1>探索</h1>
      <p className="sub">排序用你自己嘅信任名單計,同大眾評分冇關。</p>

      <div className="bar">
        <select value={spot} onChange={(e) => setSpot(Number(e.target.value))}>
          {SPOTS.map((x, i) => <option key={x.name} value={i}>{x.name}</option>)}
        </select>
        <div className="seg">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>清單</button>
          <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>地圖</button>
        </div>
        <span className="muted">
          {rows ? `${withSignal.length} 間有訊號 · ${noSignal.length} 間未知` : '載入中…'}
        </span>
      </div>

      {err && <div className="err">{err}</div>}

      {view === 'map' ? (
        <Map rows={rows ?? []} lat={s.lat} lng={s.lng} />
      ) : !rows ? (
        <p className="empty">…</p>
      ) : (
        <>
          {withSignal.map((r) => <Card key={r.restaurant_id} r={r} />)}
          {noSignal.length > 0 && (
            <>
              <h2>你名單入面冇人講過</h2>
              {noSignal.map((r) => <Card key={r.restaurant_id} r={r} />)}
            </>
          )}
          {rows.length === 0 && <p className="empty">呢個範圍內冇餐廳資料</p>}
        </>
      )}
    </>
  );
}

function Card({ r }: { r: ScoredRestaurant }) {
  const sig = classify(r);
  const norm = displayScore(r);

  return (
    <Link href={`/r/${r.restaurant_id}`} className="card">
      <div className="card-head">
        <span className="card-name">{r.name}</span>
        <span className="card-dist">{formatDistance(r.distance_m)}</span>
        <span className={`card-score t-${sig.tone === 'neutral' ? 'dim' : sig.tone}`}>
          {norm !== null ? (norm > 0 ? '+' : '') + norm.toFixed(2) : '—'}
        </span>
      </div>

      <div className="card-detail">
        <span className={`badge tone-${sig.tone}`}>{sig.label}</span>{' '}
        {sig.detail}
      </div>

      {r.n_signal > 0 && (
        <div className="quad">
          {r.trusted_pos    > 0 && <i className="pos">信 · 讚 {r.trusted_pos}</i>}
          {r.trusted_neg    > 0 && <i className="neg">信 · 彈 {r.trusted_neg}</i>}
          {r.distrusted_pos > 0 && <i className="neg">唔信 · 讚 {r.distrusted_pos}</i>}
          {r.distrusted_neg > 0 && <i className="pos">唔信 · 彈 {r.distrusted_neg}</i>}
          {r.unknown_pos    > 0 && <i>未評 · 讚 {r.unknown_pos}</i>}
        </div>
      )}
    </Link>
  );
}
