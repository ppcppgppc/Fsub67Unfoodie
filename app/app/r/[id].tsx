import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { db, useUser } from '@/lib/db';
import { useTheme, type Theme } from '@/lib/theme';
import {
  getRestaurant, restaurantMentions, rateRestaurant, myRating,
  SENTIMENT_SCALE, tierInfo, type MentionDetail,
} from '@unfoodie/core';

export default function Restaurant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const s = st(t);
  const userId = useUser();

  const [r, setR] = useState<any>(null);
  const [ms, setMs] = useState<MentionDetail[]>([]);
  const [mine, setMine] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    const [rr, mm, my] = await Promise.all([
      getRestaurant(db(), id),
      restaurantMentions(db(), userId, id),
      myRating(db(), userId, id),
    ]);
    setR(rr); setMs(mm); setMine(my);
  }, [userId, id]);

  useEffect(() => { load(); }, [load]);

  if (!r) return <View style={s.center}><ActivityIndicator /></View>;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 18, paddingBottom: 50 }}>
      <Text style={s.h1}>{r.name}</Text>
      <Text style={s.sub}>{r.address} · {(r.cuisine ?? []).join('、')}</Text>

      <Text style={s.h2}>你食過未</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {SENTIMENT_SCALE.slice().reverse().map((x) => (
          <Pressable key={x.score} onPress={async () => {
            await rateRestaurant(db(), userId!, id!, x.score); setMine(x.score);
          }}>
            <Text style={{ fontSize: 26, color: mine !== null && mine >= x.score ? t.warn : t.inkFaint }}>★</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.note}>
        {mine !== null
          ? `你畀咗「${SENTIMENT_SCALE.find((x) => x.score === mine)?.label}」—— 呢個評分會攞去搵同你口味相近嘅食評人`
          : '評完之後,系統會用佢反推你應該信邊個'}
      </Text>

      <Text style={s.h2}>邊個講過（{ms.length}）</Text>
      {ms.map((m) => {
        const w = m.tier ? tierInfo(m.tier).weight : 0;
        const c = w * m.sentiment_score;
        return (
          <View style={s.row} key={m.id}>
            <View style={{ flexShrink: 1 }}>
              <Text style={s.name}>{m.foodie_name}</Text>
              <Text style={s.meta}>
                {m.platform} · @{m.handle}
                {m.posted_at ? ` · ${m.posted_at.slice(0, 10)}` : ''}
              </Text>
            </View>
            <Text style={[s.cell, { color: m.sentiment_score > 0 ? t.good : m.sentiment_score < 0 ? t.bad : t.inkFaint }]}>
              {SENTIMENT_SCALE.find((x) => x.score === m.sentiment_score)?.label}
            </Text>
            <Text style={[s.num, { color: w > 0 ? t.good : w < 0 ? t.bad : t.inkFaint }]}>
              {m.tier ? (w > 0 ? `+${w}` : w) : '·'}
            </Text>
            <Text style={[s.num, { color: c > 0 ? t.good : c < 0 ? t.bad : t.inkFaint }]}>
              {c === 0 ? '0' : (c > 0 ? '+' : '') + c.toFixed(1)}
            </Text>
          </View>
        );
      })}
      <Text style={s.note}>
        最右邊嗰欄係「你嘅信任等級 × 佢嘅評價」。黑名單嘅人讚,就係負數 —— 呢個乘數就係成個 app。
      </Text>
    </ScrollView>
  );
}

const st = (t: Theme) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
  h1: { fontSize: 24, fontWeight: '700', color: t.ink, letterSpacing: -0.5 },
  h2: { fontSize: 14, fontWeight: '600', color: t.inkSoft, marginTop: 24, marginBottom: 9 },
  sub: { color: t.inkSoft, fontSize: 13, marginTop: 3 },
  note: { color: t.inkFaint, fontSize: 12, marginTop: 9, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8,
         backgroundColor: t.surface, borderWidth: 1, borderColor: t.line,
         borderRadius: 11, padding: 12, marginBottom: 7 },
  name: { fontSize: 14, fontWeight: '600', color: t.ink },
  meta: { fontSize: 11, color: t.inkFaint, marginTop: 2 },
  cell: { marginLeft: 'auto', fontSize: 12 },
  num: { fontSize: 13, fontWeight: '700', minWidth: 38, textAlign: 'right',
         fontVariant: ['tabular-nums'] },
});
