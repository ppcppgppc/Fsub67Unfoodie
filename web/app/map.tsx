'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  classify, displayScore, formatDistance, type ScoredRestaurant, type Signal,
} from '@unfoodie/core';
import { signed } from '@/lib/format';

// OpenFreeMap:免費 OSM vector tiles,冇 API key、冇用量上限。
// positron / dark 底圖顏色淡,等訊號 marker 跳出嚟;載入失敗就退返 liberty。
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  fallback: 'https://tiles.openfreemap.org/styles/liberty',
};

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export default function Map({
  rows, lat, lng,
}: { rows: ScoredRestaurant[]; lat: number; lng: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: prefersDark() ? STYLES.dark : STYLES.light,
      center: [lng, lat],
      zoom: 14,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // 底圖載唔到(例如 style 改名)就退返 liberty,唔好成幅地圖白咗
    let fellBack = false;
    m.on('error', (e) => {
      if (!fellBack && !m.isStyleLoaded() && /style/i.test(String(e.error?.message ?? ''))) {
        fellBack = true;
        m.setStyle(STYLES.fallback);
      }
    });

    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 換區:先飛去中心,等新資料返嚟再 fit
  useEffect(() => {
    map.current?.jumpTo({ center: [lng, lat], zoom: 14 });
  }, [lat, lng]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];

    // 冇訊號嘅先畫,有訊號嘅後畫 —— 疊埋嗰陣重要嘅喺上面
    const ordered = [...rows].sort((a, b) => Number(a.n_signal > 0) - Number(b.n_signal > 0));

    ordered.forEach((r) => {
      const sig = classify(r);
      const popup = new maplibregl.Popup({ offset: 16, closeButton: false, maxWidth: '260px' })
        .setDOMContent(popupContent(r, sig));
      markers.current.push(
        new maplibregl.Marker({ element: markerEl(r, sig), anchor: 'center' })
          .setLngLat([r.lng, r.lat])
          .setPopup(popup)
          .addTo(m),
      );
    });

    // 令全部餐廳都喺畫面入面;得一間就唔好 zoom 到貼晒地
    if (rows.length > 0) {
      const b = new maplibregl.LngLatBounds();
      rows.forEach((r) => b.extend([r.lng, r.lat]));
      b.extend([lng, lat]);
      m.fitBounds(b, { padding: 56, maxZoom: 15.5, duration: 0 });
    }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="map-wrap">
      <div id="map" ref={el} />
      <Legend />
    </div>
  );
}

function Legend() {
  const items: [Signal['tone'], string][] = [
    ['good', '推薦'], ['bad', '避／可疑'], ['warn', '反而值得試'], ['neutral', '未知'],
  ];
  return (
    <ul className="map-legend" aria-label="圖例">
      {items.map(([tone, label]) => (
        <li key={tone}><i className={`mk-dot mk-${tone}`} />{label}</li>
      ))}
    </ul>
  );
}

/** 有訊號 → 帶標籤嘅 pill;冇訊號 → 細灰點。用 button 等 keyboard 都撳得到。 */
function markerEl(r: ScoredRestaurant, sig: Signal): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', `${r.name}:${sig.label}`);
  if (r.n_signal > 0) {
    b.className = `mk-pill mk-${sig.tone}`;
    b.textContent = sig.label;
  } else {
    b.className = 'mk-dot mk-neutral mk-small';
  }
  return b;
}

// 唔用 setHTML:餐廳名將來嚟自眾包同 LLM 抽取,唔可以當 HTML 塞入去
function popupContent(r: ScoredRestaurant, sig: Signal): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'map-pop';

  const head = document.createElement('div');
  head.className = 'map-pop-head';
  const name = document.createElement('b');
  name.textContent = r.name;
  const dist = document.createElement('span');
  dist.className = 'map-pop-dist';
  dist.textContent = formatDistance(r.distance_m);
  head.append(name, dist);

  const line = document.createElement('div');
  line.className = 'map-pop-line';
  const badge = document.createElement('span');
  badge.className = `badge tone-${sig.tone}`;
  badge.textContent = sig.label;
  const norm = displayScore(r);
  line.append(badge);
  if (norm !== null) {
    const sc = document.createElement('span');
    sc.className = `map-pop-score t-${sig.tone === 'neutral' ? 'dim' : sig.tone}`;
    sc.textContent = signed(norm, 2);
    line.append(sc);
  }

  const detail = document.createElement('div');
  detail.className = 'map-pop-detail';
  detail.textContent = sig.detail;

  const link = document.createElement('a');
  link.href = `/r/${r.restaurant_id}`;
  link.className = 'map-pop-link';
  link.textContent = '睇邊個講過 →';

  wrap.append(head, line, detail, link);
  return wrap;
}
