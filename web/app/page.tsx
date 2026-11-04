'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
type Snap = 'peek' | 'half' | 'full';

const km = (m: number) => `${m / 1000}km`;

export default function Explore() {
  const userId = useUser();
  if (userId === undefined) return <p className="empty">載入中…</p>;
  if (userId === null) return <Landing />;
  return <Nearby userId={userId} />;
}

/* ------------------------------------------------------------------ */

function Landing() {
  const cells = [
    { kind: 'recommended', tone: 'good', label: '推薦', who: '你信嘅人', what: '讚' },
    { kind: 'avoid',       tone: 'bad',  label: '避',   who: '你信嘅人', what: '彈' },
    { kind: 'suspect',     tone: 'bad',  label: '可疑', who: '你唔信嘅人', what: '讚' },
    { kind: 'contrarian',  tone: 'warn', label: '反而值得試', who: '你唔信嘅人', what: '彈' },
  ] as const;
  return (
    <div className="landing">
      <p className="eyebrow">唔收廣告嘅食評</p>
      <h1 className="hero">你唔使判斷邊間舖好食。<br />你只需要判斷你信邊個。</h1>
      <p className="lede">
        畀每個食評人一個信任等級，由 +10 到 −10。每間舖用你自己嘅名單計分 ——
        同大眾評分冇關，亦冇人可以俾錢買位。
      </p>
      <div className="tiles">
        {cells.map((c) => {
          const Icon = SIGNAL_ICON[c.kind];
          return (
            <div key={c.kind} className={`tile ${c.kind === 'suspect' ? 'tile-key' : ''}`}>
              <span className={`glyph g-${c.tone}`}><Icon size={18} /></span>
              <b>{c.label}</b>
              <span>{c.who}{c.what}</span>
            </div>
          );
        })}
      </div>
      <p className="muted">「可疑」係其他平台永遠唔會話你聽嘅嘢 —— 因為佢哋嘅收入都嚟自嗰班人。</p>
      <Link href="/login" className="btn primary">開始</Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

function snapPx(s: Snap): number {
  const h = window.innerHeight;
  return s === 'peek' ? 150 : s === 'half' ? Math.round(h * 0.42) : h - 92;
}

function Nearby({ userId }: { userId: string }) {
  const phone = useIsPhone();
  const [place, setPlace] = useState<Place | null>(null);
  const [radius, setRadius] = useState(EXPLORE_RADIUS_M);
  const [rows, setRows] = useState<ScoredRestaurant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // 手機版底部玻璃 sheet:peek / half / full 三個高度,可以拖
  const [snap, setSnap] = useState<Snap>('half');
  const [dragH, setDragH] = useState<number | null>(null);
  const [vh, setVh] = useState(800);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    on(); window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const sheetH = dragH ?? (typeof window === 'undefined' ? 360 : snapPx(snap));
  const drag = useRef<{ y: number; h: number } | null>(null);

  function onGrabDown(e: React.PointerEvent) {
    drag.current = { y: e.clientY, h: sheetH };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onGrabMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const h = drag.current.h + (drag.current.y - e.clientY);
    setDragH(Math.max(snapPx('peek'), Math.min(snapPx('full'), h)));
  }
  function onGrabUp(e: React.PointerEvent) {
    if (!drag.current) return;
    const moved = Math.abs(e.clientY - drag.current.y);
    const h = dragH ?? drag.current.h;
    drag.current = null;
    setDragH(null);
    if (moved < 6) { // 撳一下 = 轉高度
      setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');
      return;
    }
    const best = (['peek', 'half', 'full'] as Snap[])
      .reduce((a, b) => (Math.abs(snapPx(b) - h) < Math.abs(snapPx(a) - h) ? b : a));
    setSnap(best);
  }

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
      setSnap('half');
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
    setSnap('half');
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

  // 撳地圖 pin → sheet 至少拉到一半,清單捲去嗰行
  function pickFromMap(id: string | null) {
    setSelected(id);
    if (!id) return;
    if (phone && snap === 'peek') setSnap('half');
    requestAnimationFrame(() =>
      document.getElementById(`row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  const signal = (rows ?? []).filter((r) => r.n_signal > 0);
  const quiet  = (rows ?? []).filter((r) => r.n_signal === 0);
  const spotIndex = place?.kind === 'spot' ? EXPLORE_SPOTS.findIndex((s) => s.name === place.label) : -1;
  const insets = phone
    ? { top: 76, right: 40, bottom: (place ? snapPx(snap) : 0) + 24, left: 40 }
    : { top: 90, right: 70, bottom: 50, left: 420 };
  void vh; // vh 變咗要 re-render,等 snapPx 用返新高度

  return (
    <div className="ex" style={{ '--sheet-h': `${place ? sheetH : 0}px` } as React.CSSProperties}>
      <div className="ex-map">
        <Map
          rows={rows ?? []}
          center={place ?? EXPLORE_SPOTS[0]}
          me={place?.kind === 'gps' ? place : null}
          selected={selected ?? hover}
          onSelect={pickFromMap}
          insets={insets}
        />
      </div>

      {place && (
        <button className="fab glass" onClick={goGps} disabled={locating}
                aria-label={place.kind === 'gps' ? '重新定位' : '用我嘅位置'}
                data-on={place.kind === 'gps' || undefined}>
          <IconLocate size={20} />
        </button>
      )}

      {!place ? (
        <div className="perm-wrap">
          <div className="perm glass" role="dialog" aria-labelledby="perm-h">
            <span className="perm-icon"><IconLocate size={26} /></span>
            <h2 id="perm-h">睇吓你附近有咩食</h2>
            <p>用你嘅位置，搵附近你信嘅人讚過嘅舖 —— 同埋邊間淨係得你唔信嘅人讚。</p>
            <button className="btn primary block" onClick={goGps} disabled={locating}>
              {locating ? '搵緊你嘅位置…' : '用我嘅位置'}
            </button>
            {err && <p className="perm-err" role="alert">{err}</p>}
            <p className="perm-or">或者揀個地區</p>
            <div className="chips">
              {EXPLORE_SPOTS.map((s, i) => (
                <button key={s.name} className="chip" onClick={() => goSpot(i)}>{s.name}</button>
              ))}
            </div>
            <p className="perm-fine">位置會捨入到約 100 米先用嚟查附近餐廳，唔會記錄落你個 account。</p>
          </div>
        </div>
      ) : (
        <section
          className={`sheet glass ${dragH !== null ? 'dragging' : ''}`}
          aria-label="附近餐廳"
          style={phone ? { height: sheetH } : undefined}
        >
          <div className="sheet-grab" onPointerDown={onGrabDown} onPointerMove={onGrabMove}
               onPointerUp={onGrabUp} onPointerCancel={onGrabUp}>
            <span className="grabber" aria-hidden="true" />
            <div className="sheet-head">
              <div>
                <h1 className="sheet-title">{place.label}</h1>
                <p className="sheet-sub">
                  {loading || !rows ? '搵緊…' : `${km(radius)} 內 · ${signal.length} 間有訊號`}
                  <span className="demo-tag">示範資料</span>
                </p>
              </div>
              <select className="menu" value={spotIndex} onChange={(e) => goSpot(Number(e.target.value))}
                      onPointerDown={(e) => e.stopPropagation()} aria-label="揀地區">
                <option value={-1} disabled>地區</option>
                {EXPLORE_SPOTS.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="sheet-body">
            {err && <div className="err" role="alert">{err}</div>}
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
          </div>
        </section>
      )}
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
        <span className={`glyph g-${sig.tone}`}><Icon size={17} /></span>
        <span className="row-main">
          <span className="row-name">{r.name}</span>
          <span className="row-sub">
            <b className={`t-${sig.tone}`}>{sig.label}</b> · {sig.detail}
          </span>
        </span>
        <span className="row-end">
          <span className={`row-score t-${norm === null ? 'dim' : sig.tone}`}
                title={norm === null ? '少過 3 個訊號，唔顯示分數' : '你名單入面嘅加權平均(−1 至 +1)'}>
            {norm !== null ? signed(norm, 2) : '—'}
          </span>
          <span className="row-dist">{formatDistance(r.distance_m)}</span>
        </span>
      </Link>
    </li>
  );
}
