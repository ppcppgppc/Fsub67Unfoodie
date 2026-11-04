'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { db, useUser } from '@/lib/db';
import {
  getRestaurant, restaurantMentions, rateRestaurant, myRating,
  SENTIMENT_SCALE, tierInfo, type MentionDetail,
} from '@unfoodie/core';

export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const userId = useUser();
  const [r, setR] = useState<any>(null);
  const [ms, setMs] = useState<MentionDetail[]>([]);
  const [mine, setMine] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [rr, mm, my] = await Promise.all([
      getRestaurant(db(), id),
      restaurantMentions(db(), userId, id),
      myRating(db(), userId, id),
    ]);
    setR(rr); setMs(mm); setMine(my);
  }, [userId, id]);

  useEffect(() => { load(); }, [load]);

  if (userId === null) return <p className="empty">要登入先</p>;
  if (!r) return <p className="empty">…</p>;

  async function rate(score: number) {
    await rateRestaurant(db(), userId!, id, score);
    setMine(score);
  }

  return (
    <>
      <h1>{r.name}</h1>
      <p className="sub">{r.address} · {(r.cuisine ?? []).join('、')}</p>

      <h2>你食過未</h2>
      <div className="stars">
        {SENTIMENT_SCALE.slice().reverse().map((s) => (
          <button
            key={s.score}
            className={mine !== null && mine >= s.score ? 'on' : ''}
            title={s.label}
            onClick={() => rate(s.score)}
          >★</button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        {mine !== null
          ? `你畀咗「${SENTIMENT_SCALE.find((x) => x.score === mine)?.label}」—— 呢個評分會攞去搵同你口味相近嘅食評人`
          : '評完之後,系統會用佢反推你應該信邊個'}
      </p>

      <h2>邊個講過（{ms.length}）</h2>
      {ms.length === 0 && <p className="empty">未有人講過呢間舖</p>}
      {ms.map((m) => {
        const w = m.tier ? tierInfo(m.tier).weight : 0;
        const contrib = w * m.sentiment_score;
        return (
          <div className="frow" key={m.id}>
            <div className="who">
              <div className="nm">
                {m.foodie_name}
                {m.is_disclosed_ad && <span className="badge tone-warn" style={{ marginLeft: 8 }}>已申報合作</span>}
              </div>
              <div className="hd">
                {m.platform} · @{m.handle}
                {m.posted_at && ` · ${new Date(m.posted_at).toISOString().slice(0, 10)}`}
                {' · 配對信心 '}{(m.match_confidence * 100).toFixed(0)}%
              </div>
            </div>
            <div className="act">
              <span className={m.sentiment_score > 0 ? 't-good' : m.sentiment_score < 0 ? 't-bad' : 't-dim'}>
                {SENTIMENT_SCALE.find((x) => x.score === m.sentiment_score)?.label ?? m.sentiment_score}
              </span>
              <span className={`wt ${w > 0 ? 't-good' : w < 0 ? 't-bad' : 't-dim'}`}>
                {m.tier ? (w > 0 ? `+${w}` : w) : '·'}
              </span>
              <span className={`wt ${contrib > 0 ? 't-good' : contrib < 0 ? 't-bad' : 't-dim'}`}>
                {contrib === 0 ? '0' : (contrib > 0 ? '+' : '') + contrib.toFixed(1)}
              </span>
            </div>
          </div>
        );
      })}
      <p className="muted">
        最右邊嗰欄係「你嘅信任等級 × 佢嘅評價」。黑名單嘅人讚,就係負數 —— 呢個乘數就係成個 app。
      </p>
    </>
  );
}
