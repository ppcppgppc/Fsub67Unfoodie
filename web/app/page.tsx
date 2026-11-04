'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { errMsg, signed } from '@/lib/format';
import { alreadyGranted, locate, LocateError, type LatLng } from '@/lib/location';
import { IconLocate, SIGNAL_ICON } from '@/lib/icons';
import {
  nearbyWithScore, classify, displayScore, formatDistance, EXPLORE_SPOTS, EXPLORE_RADIUS_M,
  type ScoredRestaurant,
} from '@unfoodie/core';

const Map = dynamic(() => import('./map'), {
  ssr: false,
  loading: () => <div className="map-canvas" />,
});

/** 用 GPS 時由近搵起,太少舖就逐步放大 */
const GPS_RADII = [1000, 2500, 5000];
const ENOUGH = 6;
const MODE_KEY = 'unfoodie.where'; // 'gps' 或者地區 index

type Place = LatLng & { label: string; kind: 'gps' | 'spot' };

const km = (m: number) => `${m / 1000}km`;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? '夜晚好' : h < 11 ? '早晨' : h < 14 ? '午安' : h < 18 ? '下晝好' : '晚上好';
}

export default function Explore() {
  const userId = useUser();
  if (userId === undefined) return <p className="empty">載入中…</p>;
  if (userId === null) return <Landing />;
  return <Nearby userId={userId} />;
}

/* ------------------------------------------------------------------ */

function Landing() {
  const cells = [
    { kind: 'recommended', tone: 'good', label: '推薦', desc: '你信嘅人讚' },
    { kind: 'avoid',       tone: 'bad',  label: '避',   desc: '你信嘅人彈' },
    { kind: 'suspect',     tone: 'bad',  label: '可疑', desc: '淨係得你唔信嘅人讚' },
    { kind: 'contrarian',  tone: 'warn', label: '反而值得試', desc: '你唔信嘅人彈' },
  ] as const;
  return (
    <div className="landing">
      <span className="hero-mark" aria-hidden="true">±</span>
      <h1 className="display">你唔使判斷邊間舖好食。<br />你只需要判斷你信邊個。</h1>
      <p className="lede">
        畀每個食評人一個信任等級，由 +10 到 −10。每間舖用你自己嘅名單計分 ——
        唔收廣告，亦冇人可以俾錢買位。
      </p>
      <div className="cards">
        {cells.map((c) => {
          const Icon = SIGNAL_ICON[c.kind];
          return (
            <div key={c.kind} className="card-s">
              <span className={`dot d-${c.tone}`}><Icon size={14} /></span>
              <b>{c.label}</b>
              <span>{c.desc}</span>
            </div>
          );
        })}
      </div>
      <p className="muted">「可疑」係其他平台永遠唔會話你聽嘅嘢 —— 因為佢哋嘅收入都嚟自嗰班人。</p>
      <Link href="/login" className="btn primary">開始使用</Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Nearby({ userId }: { userId: string }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [radius, setRadius] = useState(EXPLORE_RADIUS_M);
  const [rows, setRows] = useState<ScoredRestaurant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hello, setHello] = useState('你好');
  useEffect(() => setHello(greeting()), []);

  const fetchFor = useCallback(async (p: Place) => {
    setLoading(true); setErr(null); setSelected(null);
    try {
      if (p.kind === 'spot') {
        setRadius(EXPLORE_RADIUS_M);
        setRows(await nearbyWithScore(db(), userId, p.lat, p.lng, EXPLORE_RADIUS_M));
        return;
      }
      let got: ScoredRestaurant[] = [];
      for (const r of GPS_RADII) {
        got = await nearbyWithScore(db(), userId, p.lat, p.lng, r);
        setRadius(r);
        if (got.length >= ENOUGH) break;
      }
      setRows(got);
    } catch (e) {
      setErr(`載入唔到附近餐廳：${errMsg(e)}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const goGps = useCallback(async () => {
    setLocating(true); setErr(null);
    try {
      const p: Place = { ...(await locate()), label: '你附近', kind: 'gps' };
      setPlace(p);
      try { localStorage.setItem(MODE_KEY, 'gps'); } catch { /* 冇所謂 */ }
      await fetchFor(p);
    } catch (e) {
      setErr(e instanceof LocateError ? e.message : errMsg(e));
    } finally {
      setLocating(false);
    }
  }, [fetchFor]);

  function goSpot(i: number) {
    const s = EXPLORE_SPOTS[i];
    const p: Place = { lat: s.lat, lng: s.lng, label: s.name, kind: 'spot' };
    setPlace(p);
    try { localStorage.setItem(MODE_KEY, String(i)); } catch { /* 冇所謂 */ }
    fetchFor(p);
  }

  // 上次揀咗地區就用返;上次用 GPS 而權限仲喺度就靜靜雞再攞,唔會彈窗
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(MODE_KEY); } catch { /* 私密模式 */ }
    if (saved === 'gps') {
      alreadyGranted().then((ok) => { if (ok) goGps(); });
    } else if (saved !== null && Number(saved) >= 0 && Number(saved) < EXPLORE_SPOTS.length) {
      goSpot(Number(saved));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 撳地圖 pin → 清單捲去嗰行
  function pickFromMap(id: string | null) {
    setSelected(id);
    if (id) requestAnimationFrame(() =>
      document.getElementById(`row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  /* ---------- 未揀位置:似對話開場 ---------- */
  if (!place) {
    return (
      <div className="start">
        <span className="hero-mark" aria-hidden="true">±</span>
        <h1 className="display">{hello}，今日想食咩？</h1>
        <div className="composer">
          <button className="composer-main" onClick={goGps} disabled={locating}>
            <span className="composer-text">
              {locating ? '搵緊你嘅位置…' : '用我而家嘅位置，搵附近你信嘅人讚過嘅舖'}
            </span>
          </button>
          <button className="composer-go" onClick={goGps} disabled={locating} aria-label="用我嘅位置">
            <IconLocate size={18} />
          </button>
        </div>
        {err && <p className="start-err" role="alert">{err}</p>}
        <div className="chips">
          {EXPLORE_SPOTS.map((s, i) => (
            <button key={s.name} className="chip" onClick={() => goSpot(i)}>{s.name}</button>
          ))}
        </div>
        <p className="fine">位置會捨入到約 100 米先用嚟查附近餐廳，唔會記錄落你個 account。示範版資料全部虛構。</p>
      </div>
    );
  }

  /* ---------- 結果:清單 + 地圖卡 ---------- */
  const signal = (rows ?? []).filter((r) => r.n_signal > 0);
  const quiet  = (rows ?? []).filter((r) => r.n_signal === 0);
  const spotIndex = place.kind === 'spot' ? EXPLORE_SPOTS.findIndex((s) => s.name === place.label) : -1;

  return (
    <div className="ex">
      <header className="ex-head">
        <div>
          <h1 className="title">{place.label}</h1>
          <p className="meta">
            {loading || !rows ? '搵緊…' : `${km(radius)} 內 · ${signal.length} 間有訊號`}
            <span className="tag">示範資料</span>
          </p>
        </div>
        <div className="ex-tools">
          <button className="btn ghost sm" onClick={goGps} disabled={locating}>
            <IconLocate size={14} />{locating ? '搵緊…' : place.kind === 'gps' ? '重新定位' : '用我嘅位置'}
          </button>
          <select value={spotIndex} onChange={(e) => goSpot(Number(e.target.value))} aria-label="揀地區">
            <option value={-1} disabled>地區</option>
            {EXPLORE_SPOTS.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
          </select>
        </div>
      </header>

      {err && <div className="err" role="alert">{err}</div>}

      <div className="ex-body">
        <div className="map-card">
          <Map
            rows={rows ?? []}
            center={place}
            me={place.kind === 'gps' ? place : null}
            selected={selected ?? hover}
            onSelect={pickFromMap}
            insets={{ top: 10, right: 10, bottom: 10, left: 10 }}
          />
        </div>

        <section className="ex-list" aria-label="附近餐廳">
          {loading || !rows ? (
            <p className="empty">搵緊附近嘅舖…</p>
          ) : rows.length === 0 ? (
            <div className="empty">
              <p>{km(radius)} 內未有資料。示範版淨係有香港同東京幾區嘅虛構餐廳。</p>
              <div className="chips center">
                {EXPLORE_SPOTS.map((s, i) => <button key={s.name} className="chip" onClick={() => goSpot(i)}>{s.name}</button>)}
              </div>
            </div>
          ) : (
            <>
              {signal.length === 0 && (
                <p className="hint">
                  附近啲舖你名單入面未有人講過。去<Link href="/foodies">食評人</Link>揀幾個你信（或者唔信）嘅人。
                </p>
              )}
              {signal.length > 0 && (
                <ul className="list">
                  {signal.map((r) => (
                    <Row key={r.restaurant_id} r={r} on={selected === r.restaurant_id} onHover={setHover} />
                  ))}
                </ul>
              )}
              {quiet.length > 0 && (
                <>
                  <h3 className="list-h">你名單入面冇人講過</h3>
                  <ul className="list">
                    {quiet.map((r) => (
                      <Row key={r.restaurant_id} r={r} on={selected === r.restaurant_id} onHover={setHover} />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ r, on, onHover }: { r: ScoredRestaurant; on: boolean; onHover: (id: string | null) => void }) {
  const sig = classify(r);
  const norm = displayScore(r);
  const Icon = SIGNAL_ICON[sig.kind];
  return (
    <li id={`row-${r.restaurant_id}`} className={`row ${on ? 'on' : ''}`}
        onMouseEnter={() => onHover(r.restaurant_id)} onMouseLeave={() => onHover(null)}>
      <Link href={`/r/${r.restaurant_id}`} className="row-link"
            onFocus={() => onHover(r.restaurant_id)} onBlur={() => onHover(null)}>
        <span className={`dot d-${sig.tone}`}><Icon size={13} /></span>
        <span className="row-main">
          <span className="row-top">
            <span className="row-name">{r.name}</span>
            <span className="row-dist">{formatDistance(r.distance_m)}</span>
          </span>
          <span className="row-sub"><b className={`t-${sig.tone}`}>{sig.label}</b>　{sig.detail}</span>
        </span>
        <span className={`row-score t-${norm === null ? 'dim' : sig.tone}`}
              title={norm === null ? '少過 3 個訊號，唔顯示分數' : '你名單入面嘅加權平均(−1 至 +1)'}>
          {norm !== null ? signed(norm, 2) : '—'}
        </span>
      </Link>
    </li>
  );
}
