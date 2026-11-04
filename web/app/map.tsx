'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { classify, type ScoredRestaurant } from '@unfoodie/core';
import type { LatLng } from '@/lib/location';
import { SIGNAL_SVG } from '@/lib/icons';
import { isDark, THEME_EVENT } from '@/lib/theme';

// OpenFreeMap:免費 OSM vector tiles,冇 API key、冇用量上限。
// positron / dark 底圖顏色淡,等 pin 跳出嚟;載入失敗就退返 liberty。
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  fallback: 'https://tiles.openfreemap.org/styles/liberty',
};


type Insets = { top: number; right: number; bottom: number; left: number };

export default function Map({
  rows, center, me, selected, onSelect, insets,
}: {
  rows: ScoredRestaurant[];
  center: LatLng;
  /** 用戶位置(用 GPS 先有) */
  me: LatLng | null;
  /** 清單 hover 或者撳中嘅餐廳 */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** 浮喺地圖上面嘅 panel 遮住幾多,fit 嗰陣避開 */
  insets: Insets;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new globalThis.Map<string, maplibregl.Marker>());
  const meMarker = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  /** 清單排名次序(有訊號嘅),用嚟決定邊個 pin 嘅名有資格顯示 */
  const rankRef = useRef<string[]>([]);

  // 似 Apple Maps:名撞埋就收埋排名低嗰個,揀中嗰個永遠顯示
  const declutter = () => {
    const taken: DOMRect[] = [];
    const hit = (a: DOMRect) => taken.some((b) =>
      a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 1 && a.bottom > b.top - 1);
    // pin 本身先佔位,名唔可以遮住其他 pin
    markers.current.forEach((mk) => {
      const f = mk.getElement().querySelector('.pin-face');
      if (f) taken.push(f.getBoundingClientRect());
    });
    const sel = selectedRef.current;
    const order = sel ? [sel, ...rankRef.current.filter((id) => id !== sel)] : rankRef.current;
    for (const id of order) {
      const label = markers.current.get(id)?.getElement().querySelector<HTMLElement>('.pin-label');
      if (!label) continue;
      label.style.visibility = 'visible';
      const r = label.getBoundingClientRect();
      if (id !== sel && hit(r)) label.style.visibility = 'hidden';
      else taken.push(r);
    }
  };
  const declutterRef = useRef(declutter);
  declutterRef.current = declutter;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: isDark() ? STYLES.dark : STYLES.light,
      center: [center.lng, center.lat],
      zoom: 12,
      attributionControl: { compact: true },
    });

    // 底圖載唔到(例如 style 改名)就退返 liberty,唔好成幅地圖白咗
    let fellBack = false;
    m.on('error', (e) => {
      if (!fellBack && !m.isStyleLoaded() && /style/i.test(String(e.error?.message ?? ''))) {
        fellBack = true;
        m.setStyle(STYLES.fallback);
      }
    });
    // 撳空白位 = 取消揀選。撳 pin 都會觸發呢個 event,要排除
    m.on('click', (e) => {
      if ((e.originalEvent.target as HTMLElement | null)?.closest('.maplibregl-marker')) return;
      onSelectRef.current(null);
    });

    m.on('moveend', () => declutterRef.current());

    // 外觀轉咗(手動或者系統)就換底圖
    let dark = isDark();
    const onTheme = () => {
      const now = isDark();
      if (now === dark) return;
      dark = now;
      fellBack = false;
      m.setStyle(now ? STYLES.dark : STYLES.light);
    };
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener(THEME_EVENT, onTheme);
    mq.addEventListener('change', onTheme);

    // 容器大細變,MapLibre 自己唔知
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);

    map.current = m;
    return () => {
      ro.disconnect();
      window.removeEventListener(THEME_EVENT, onTheme);
      mq.removeEventListener('change', onTheme);
      m.remove(); map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 換位置:冇餐廳嘅時候先飛過去;有餐廳就交俾下面 fit
  useEffect(() => {
    if (rows.length === 0) {
      map.current?.easeTo({ center: [center.lng, center.lat], zoom: 13.5, padding: insetsRef.current, duration: 700 });
    }
  }, [center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // 用戶位置:藍點 + 光暈
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    meMarker.current?.remove();
    meMarker.current = null;
    if (!me) return;
    const dot = document.createElement('div');
    dot.className = 'me';
    meMarker.current = new maplibregl.Marker({ element: dot }).setLngLat([me.lng, me.lat]).addTo(m);
    dot.setAttribute('aria-label', '你喺度');
  }, [me?.lat, me?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // 餐廳 pin
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current.clear();

    // 冇訊號嘅先畫,有訊號嘅後畫 —— 疊埋嗰陣重要嘅喺上面
    const ordered = [...rows].sort((a, b) => Number(a.n_signal > 0) - Number(b.n_signal > 0));
    for (const r of ordered) {
      const sig = classify(r);
      const has = r.n_signal > 0;
      // 外層 button 俾 MapLibre 用 transform 定位;放大效果做喺入面嗰層,
      // 否則 scale 會連定位嘅 translate 一齊放大,pin 會飄走
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pin ${has ? '' : 'pin-quiet'}`;
      const face = document.createElement('span');
      face.className = `pin-face g-${sig.tone}`;
      const s = has ? 14 : 9;
      face.innerHTML = `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${SIGNAL_SVG[sig.kind]}</svg>`;
      b.append(face);
      if (has) {
        const label = document.createElement('span');
        label.className = 'pin-label';
        label.textContent = r.name; // textContent:餐廳名唔可以當 HTML
        b.append(label);
      }
      b.addEventListener('click', (e) => { e.stopPropagation(); onSelectRef.current(r.restaurant_id); });
      // anchor top + offset:令個圓形 pin 嘅中心對正餐廳位置,名喺下面
      const mk = new maplibregl.Marker({ element: b, anchor: 'top', offset: [0, has ? -14 : -8] })
        .setLngLat([r.lng, r.lat]).addTo(m);
      // MapLibre 會將 aria-label 改做「Map marker」,要喺建立之後先設返
      b.setAttribute('aria-label', `${r.name}:${sig.label}`);
      markers.current.set(r.restaurant_id, mk);
    }

    rankRef.current = rows.filter((r) => r.n_signal > 0).map((r) => r.restaurant_id);
    requestAnimationFrame(() => declutterRef.current());

    if (rows.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      rows.forEach((r) => bounds.extend([r.lng, r.lat]));
      if (me) bounds.extend([me.lng, me.lat]);
      m.resize();
      const p = insetsRef.current;
      m.fitBounds(bounds, {
        padding: { top: p.top + 30, right: p.right + 40, bottom: p.bottom + 40, left: p.left + 40 },
        maxZoom: 15.5, duration: 700,
      });
    }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // 揀中嘅 pin 放大、浮上面
  useEffect(() => {
    markers.current.forEach((mk, id) => {
      const e = mk.getElement();
      const on = id === selected;
      e.classList.toggle('on', on);
      e.style.zIndex = on ? '5' : '';
    });
    declutterRef.current();
  }, [selected, rows]);

  return <div className="map-canvas" ref={el} />;
}
