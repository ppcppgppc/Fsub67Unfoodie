'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { classify, type ScoredRestaurant, type Signal } from '@unfoodie/core';

const TONE_COLOR: Record<string, string> = {
  good: '#16794a',
  bad: '#b3261e',
  warn: '#8a5a00',
  neutral: '#9c988d',
};

// OpenFreeMap:免費 OSM vector tiles,冇 API key、冇用量上限。
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export default function Map({
  rows, lat, lng,
}: { rows: ScoredRestaurant[]; lat: number; lng: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [lng, lat],
      zoom: 14,
    });
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    return () => { map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    map.current?.flyTo({ center: [lng, lat], zoom: 14 });
  }, [lat, lng]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];

    rows.forEach((r) => {
      const sig = classify(r);
      const dot = document.createElement('div');
      Object.assign(dot.style, {
        width: '15px', height: '15px', borderRadius: '50%',
        background: TONE_COLOR[sig.tone],
        border: '2.5px solid #fff',
        boxShadow: '0 1px 4px rgba(0,0,0,.35)',
        cursor: 'pointer',
      });
      // 唔用 setHTML:餐廳名將來嚟自眾包同 LLM 抽取,唔可以當 HTML 塞入去
      const popup = new maplibregl.Popup({ offset: 14, closeButton: false })
        .setDOMContent(popupContent(r, sig));
      markers.current.push(
        new maplibregl.Marker({ element: dot })
          .setLngLat([r.lng, r.lat])
          .setPopup(popup)
          .addTo(m),
      );
    });
  }, [rows]);

  return <div id="map" ref={el} />;
}

function popupContent(r: ScoredRestaurant, sig: Signal): HTMLElement {
  const a = document.createElement('a');
  a.href = `/r/${r.restaurant_id}`;
  a.className = 'map-pop';
  const name = document.createElement('b');
  name.textContent = r.name;
  const label = document.createElement('span');
  label.textContent = sig.label;
  label.style.color = TONE_COLOR[sig.tone];
  const detail = document.createElement('span');
  detail.textContent = sig.detail;
  a.append(name, label, detail);
  return a;
}
