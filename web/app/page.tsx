'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { errMsg, signed } from '@/lib/format';
import {
  nearbyWithScore, classify, displayScore, formatDistance, EXPLORE_SPOTS, EXPLORE_RADIUS_M,
  type ScoredRestaurant,
} from '@unfoodie/core';

const Map = dynamic(() => import('./map'), { ssr: false });

const SPOTS = EXPLORE_SPOTS;

const SPOT_KEY = 'unfoodie.spot';

export default function Explore() {
  const userId = useUser();
  if (userId === undefined) return <p className="empty">載入中…</p>;
  if (userId === null) return <Landing />;
  return <Nearby userId={userId} />;
}

function Landing() {
  return (
    <>
      <h1 className="hero">你唔使判斷邊間舖好食<br />—— 你只需要判斷你信邊個。</h1>
      <p className="sub">
        畀每個食評人一個信任等級，由 +10 到 −10，上下兩極有名額。
        每間舖用你自己嘅名單計分，同大眾評分冇關。
      </p>

      <div className="quad-grid" role="table" aria-label="信任 × 評價">
        <div className="qg-cell qg-head" role="columnheader" />
        <div className="qg-cell qg-head" role="columnheader">佢讚</div>
        <div className="qg-cell qg-head" role="columnheader">佢彈</div>

        <div className="qg-cell qg-head" role="rowheader">你信嘅人</div>
        <div className="qg-cell tone-good"><b>推薦</b><span>信得過嘅人推薦</span></div>
        <div className="qg-cell tone-bad"><b>避</b><span>信得過嘅人彈</span></div>

        <div className="qg-cell qg-head" role="rowheader">你唔信嘅人</div>
        <div className="qg-cell tone-bad"><b>可疑</b><span>淨係得佢哋讚 → 收錢味</span></div>
        <div className="qg-cell tone-warn"><b>反而值得試</b><span>冇人俾錢 KOL 去彈嘢</span></div>
      </div>

      <p className="muted">
        左下嗰格係成個 app 嘅賣點：「呢間舖淨係得你唔信嗰班人讚過」。
        冇任何平台會話你聽，因為佢哋嘅收入都嚟自嗰班人。
      </p>

      <p style={{ marginTop: 24 }}>
        <Link href="/login" className="btn primary">登入或者註冊</Link>
      </p>
    </>
  );
}

function Nearby({ userId }: { userId: string }) {
  const [spot, setSpot] = useState(0);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [rows, setRows] = useState<ScoredRestaurant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SPOT_KEY));
      if (saved > 0 && saved < SPOTS.length) setSpot(saved);
    } catch { /* 私密模式等:用預設 */ }
  }, []);

  useEffect(() => {
    let live = true;
    const s = SPOTS[spot];
    setRows(null); setErr(null);
    nearbyWithScore(db(), userId, s.lat, s.lng, EXPLORE_RADIUS_M)
      .then((r) => live && setRows(r))
      .catch((e) => live && setErr(errMsg(e)));
    return () => { live = false; };
  }, [userId, spot]);

  function pick(i: number) {
    setSpot(i);
    try { localStorage.setItem(SPOT_KEY, String(i)); } catch { /* 冇所謂 */ }
  }

  const s = SPOTS[spot];
  const withSignal = (rows ?? []).filter((r) => r.n_signal > 0);
  const noSignal   = (rows ?? []).filter((r) => r.n_signal === 0);

  return (
    <>
      <h1>探索</h1>
      <p className="sub">排序用你自己嘅信任名單計，同大眾評分冇關。</p>

      <div className="bar">
        <select value={spot} onChange={(e) => pick(Number(e.target.value))} aria-label="地區">
          {SPOTS.map((x, i) => <option key={x.name} value={i}>{x.name}</option>)}
        </select>
        <div className="seg" role="group" aria-label="顯示方式">
          <button className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>清單</button>
          <button className={view === 'map' ? 'on' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}>地圖</button>
        </div>
        <span className="muted">
          {err ? '' : rows ? `${withSignal.length} 間有訊號 · ${noSignal.length} 間未知` : '載入中…'}
        </span>
      </div>

      {err && <div className="err">載入唔到附近餐廳：{err}</div>}

      {view === 'map' ? (
        <Map rows={rows ?? []} lat={s.lat} lng={s.lng} />
      ) : !rows ? (
        !err && <p className="empty">載入中…</p>
      ) : rows.length === 0 ? (
        <p className="empty">呢個範圍內未有餐廳資料</p>
      ) : (
        <>
          {withSignal.length === 0 && (
            <p className="hint">
              呢度啲舖你名單入面未有人講過。去<Link href="/foodies">食評人</Link>揀幾個你信（或者唔信）嘅人，排序先會有意思。
            </p>
          )}
          {withSignal.map((r) => <Card key={r.restaurant_id} r={r} />)}
          {noSignal.length > 0 && (
            <>
              <h2>你名單入面冇人講過</h2>
              {noSignal.map((r) => <Card key={r.restaurant_id} r={r} />)}
            </>
          )}
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
        <span
          className={`card-score t-${sig.tone === 'neutral' ? 'dim' : sig.tone}`}
          title={norm === null ? '少過 3 個訊號，唔顯示分數' : '你名單入面嘅加權平均(−1 至 +1)'}
        >
          {norm !== null ? signed(norm, 2) : '—'}
        </span>
      </div>

      <div className="card-detail">
        <span className={`badge tone-${sig.tone}`}>{sig.label}</span>
        <span>{sig.detail}</span>
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
