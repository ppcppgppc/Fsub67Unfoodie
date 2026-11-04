import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { useTheme, signColor, SERIF, type Theme } from '@/lib/theme';
import { Badge, Banner, Btn, Center } from '@/lib/ui';
import {
  getRestaurant, restaurantMentions, rateRestaurant, myRating, contribution,
  signed, errMsg, safeHttpUrl, SENTIMENT_SCALE, tierInfo,
  type MentionDetail, type Restaurant as R,
} from '@unfoodie/core';

const sentimentLabel = (x: number) => SENTIMENT_SCALE.find((s) => s.score === x)?.label ?? String(x);

export default function Restaurant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const s = st(t);
  const router = useRouter();
  const userId = useUser();

  const [r, setR] = useState<R | null>(null);
  const [ms, setMs] = useState<MentionDetail[]>([]);
  const [mine, setMine] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rateErr, setRateErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !id) return;
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

  if (userId === null) {
    return (
      <Center>
        <Text style={s.sub}>要登入先睇到你嘅信任名單點樣睇呢間舖</Text>
        <Btn label="登入" onPress={() => router.push('/login')} />
      </Center>
    );
  }
  if (err) return <Center><Banner kind="err">載入唔到呢間舖：{err}</Banner></Center>;
  if (!r) return <Center />;

  async function rate(score: number) {
    const prev = mine;
    setMine(score); setRateErr(null);
    try {
      await rateRestaurant(db(), userId!, id!, score);
    } catch (e) {
      setMine(prev);
      setRateErr(errMsg(e));
    }
  }

  const meta = [r.name_local, r.address, (r.cuisine ?? []).join('、')].filter(Boolean).join(' · ');

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 18, paddingBottom: 50 }}>
      <Text style={s.h1}>{r.name}</Text>
      {!!meta && <Text style={s.sub}>{meta}</Text>}

      <Text style={s.h2}>你食過未</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessibilityRole="radiogroup">
        {SENTIMENT_SCALE.slice().reverse().map((x) => (
          <Pressable key={x.score} onPress={() => rate(x.score)} hitSlop={4}
                     accessibilityRole="radio" accessibilityLabel={`${x.stars} 粒星：${x.label}`}
                     accessibilityState={{ checked: mine === x.score }}>
            <Text style={{ fontSize: 30, color: mine !== null && mine >= x.score ? t.accent : t.border }}>★</Text>
          </Pressable>
        ))}
        {mine !== null && <Text style={s.starLabel}>{sentimentLabel(mine)}</Text>}
      </View>
      {rateErr && <Banner kind="err">評分儲存唔到：{rateErr}</Banner>}
      <Text style={s.note}>
        {mine !== null
          ? '呢個評分會攞去搵同你口味相近（或者相反）嘅食評人。'
          : '評完之後，系統會用佢反推你應該信邊個。'}
      </Text>

      <Text style={s.h2}>邊個講過（{ms.length}）</Text>
      {ms.length === 0 && <Text style={s.empty}>未有人講過呢間舖</Text>}
      {ms.map((m) => (
        <MentionRow key={m.id} m={m} onTakedown={() => router.push(`/takedown?mention=${m.id}`)} />
      ))}
      {ms.length > 0 && (
        <Text style={s.note}>
          右邊嘅數 = 你嘅信任等級 × 佢嘅評價 × 配對信心 × 時間衰減（半衰期 18 個月）。
          黑名單嘅人讚，就係負數 —— 呢個乘數就係成個 app。
        </Text>
      )}
    </ScrollView>
  );
}

function MentionRow({ m, onTakedown }: { m: MentionDetail; onTakedown: () => void }) {
  const t = useTheme();
  const s = st(t);
  const c = contribution(m);
  const w = m.tier ? tierInfo(m.tier).weight : 0;
  const url = safeHttpUrl(m.post_url);
  // 分兩行:RN 嘅 Text 做唔到逐段 nowrap,一行過會喺「2026-10-」或者「配」度斷
  const when = [m.posted_at?.slice(0, 10), `配對 ${(m.match_confidence * 100).toFixed(0)}%`].filter(Boolean).join(' · ');

  return (
    <View style={s.row}>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Text style={s.name}>{m.foodie_name}</Text>
          {m.is_disclosed_ad && <Badge tone="warn">已申報合作</Badge>}
        </View>
        <Text style={s.meta} numberOfLines={1}>{m.platform} · @{m.handle}</Text>
        <Text style={s.meta}>{when}</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 3 }}>
          {url && (
            <Pressable onPress={() => Linking.openURL(url)} hitSlop={6} accessibilityRole="link">
              <Text style={s.link}>原文 ↗</Text>
            </Pressable>
          )}
          <Pressable onPress={onTakedown} hitSlop={6} accessibilityRole="link">
            <Text style={s.link}>要求下架</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.calc}>
        <Text style={[s.total, { color: c.counted ? signColor(t, c.value) : t.inkFaint }]}>
          {c.counted ? signed(c.value, 1) : '—'}
        </Text>
        <Text style={s.formula}>
          <Text style={{ color: signColor(t, m.sentiment_score), fontWeight: '600' }}>{sentimentLabel(m.sentiment_score)}</Text>
          {' × '}
          <Text style={{ color: signColor(t, w), fontWeight: '600' }}>{m.tier ? signed(w) : '未評'}</Text>
        </Text>
        {!c.counted && <Text style={s.why}>{c.reason}</Text>}
      </View>
    </View>
  );
}

const st = (t: Theme) => StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '500', color: t.ink, fontFamily: SERIF },
  h2: { fontSize: 14, fontWeight: '600', color: t.inkSoft, marginTop: 26, marginBottom: 9 },
  sub: { color: t.inkSoft, fontSize: 13.5, marginTop: 3, textAlign: 'left' },
  note: { color: t.inkFaint, fontSize: 12, marginTop: 9, lineHeight: 18 },
  empty: { color: t.inkFaint, paddingVertical: 18, textAlign: 'center' },
  starLabel: { marginLeft: 8, color: t.accentText, fontWeight: '700', fontSize: 15, fontFamily: SERIF },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.line,
    borderRadius: 12, padding: 13, marginBottom: 8,
  },
  name: { fontSize: 16, fontWeight: '600', color: t.ink, fontFamily: SERIF },
  meta: { fontSize: 11.5, color: t.inkFaint, fontVariant: ['tabular-nums'] },
  link: { fontSize: 12.5, color: t.inkSoft, textDecorationLine: 'underline' },
  calc: { alignItems: 'flex-end', gap: 1 },
  total: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  formula: { fontSize: 12, color: t.inkFaint },
  why: { fontSize: 11, color: t.warn },
});
