'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { errMsg, safeHttpUrl, signed, toneClass } from '@/lib/format';
import {
  getRestaurant, restaurantMentions, rateRestaurant, myRating, contribution,
  SENTIMENT_SCALE, tierInfo, type MentionDetail, type Restaurant,
} from '@unfoodie/core';

const sentimentLabel = (s: number) =>
  SENTIMENT_SCALE.find((x) => x.score === s)?.label ?? String(s);

export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const userId = useUser();
  const [r, setR] = useState<Restaurant | null>(null);
  const [ms, setMs] = useState<MentionDetail[]>([]);
  const [mine, setMine] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rateErr, setRateErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [rr, mm, my] = await Promise.all([
        getRestaurant(db(), id),
        restaurantMentions(db(), userId, id),
        myRating(db(), userId, id),
      ]);
      setR(rr); setMs(mm); setMine(my);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [userId, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (r) document.title = `${r.name} · UNFOODIE`; }, [r]);

  if (userId === null) {
    return <p className="empty">要<Link href="/login">登入</Link>先睇到你嘅信任名單點樣睇呢間舖</p>;
  }
  if (err) return <div className="err">載入唔到呢間舖：{err}</div>;
  if (!r) return <p className="empty">載入中…</p>;

  async function rate(score: number) {
    const prev = mine;
    setMine(score); setRateErr(null);
    try {
      await rateRestaurant(db(), userId!, id, score);
    } catch (e) {
      setMine(prev);
      setRateErr(errMsg(e));
    }
  }

  return (
    <>
      <Link href="/" className="back">← 探索</Link>
      <h1>{r.name}</h1>
      <p className="sub">
        {[r.name_local, r.address, (r.cuisine ?? []).join('、')].filter(Boolean).join(' · ')}
      </p>

      <h2>你食過未</h2>
      <div className="stars" role="radiogroup" aria-label="你嘅評分">
        {SENTIMENT_SCALE.slice().reverse().map((s) => (
          <button
            key={s.score}
            role="radio"
            aria-checked={mine === s.score}
            aria-label={`${s.stars} 粒星：${s.label}`}
            className={mine !== null && mine >= s.score ? 'on' : ''}
            title={s.label}
            onClick={() => rate(s.score)}
          >★</button>
        ))}
        {mine !== null && <span className="stars-label">{sentimentLabel(mine)}</span>}
      </div>
      {rateErr && <div className="err">評分儲存唔到：{rateErr}</div>}
      <p className="muted" style={{ marginTop: 6 }}>
        {mine !== null
          ? '呢個評分會攞去搵同你口味相近（或者相反）嘅食評人。'
          : '評完之後，系統會用佢反推你應該信邊個。'}
      </p>

      <h2>邊個講過（{ms.length}）</h2>
      {ms.length === 0 && <p className="empty">未有人講過呢間舖</p>}
      {ms.map((m) => <MentionRow key={m.id} m={m} />)}

      {ms.length > 0 && (
        <p className="muted">
          右邊嘅數 = 你嘅信任等級 × 佢嘅評價 × 配對信心 × 時間衰減（半衰期 18 個月）。
          黑名單嘅人讚，就係負數 —— 呢個乘數就係成個 app。
        </p>
      )}
    </>
  );
}

function MentionRow({ m }: { m: MentionDetail }) {
  const c = contribution(m);
  const w = m.tier ? tierInfo(m.tier).weight : 0;
  const url = safeHttpUrl(m.post_url);

  return (
    <div className="mrow">
      <div className="who">
        <div className="nm">
          {m.foodie_name}
          {m.is_disclosed_ad && <span className="badge tone-warn">已申報合作</span>}
        </div>
        <div className="hd">
          {[
            `${m.platform} · @${m.handle}`,
            m.posted_at?.slice(0, 10),
            `配對 ${(m.match_confidence * 100).toFixed(0)}%`,
          ].filter(Boolean).map((s, i, all) => (
            // 分隔號跟喺前一段尾,斷行時唔會有「·」吊喺行頭
            <span key={i} className="nw">{s}{i < all.length - 1 && ' · '}</span>
          ))}
        </div>
        <div className="links">
          {url && <a href={url} target="_blank" rel="noopener noreferrer nofollow">原文 ↗</a>}
          <Link href={`/takedown?mention=${m.id}`}>要求下架</Link>
        </div>
      </div>

      <div className="calc">
        {c.counted ? (
          <span className={`calc-total ${toneClass(c.value)}`}>{signed(c.value, 1)}</span>
        ) : (
          <span className="calc-total t-dim">—</span>
        )}
        <span className="calc-formula">
          <span className={toneClass(m.sentiment_score)}>{sentimentLabel(m.sentiment_score)}</span>
          {' × '}
          <span className={toneClass(w)}>{m.tier ? signed(w) : '未評'}</span>
        </span>
        {!c.counted && <span className="calc-note">{c.reason}</span>}
      </div>
    </div>
  );
}
