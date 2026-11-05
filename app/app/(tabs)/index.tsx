import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, SectionList, Pressable, ScrollView, RefreshControl, StyleSheet,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { useTheme, toneColor, toneFill, toneBg, SERIF, type Theme } from '@/lib/theme';
import { Badge, Banner, Btn, Center } from '@/lib/ui';
import {
  nearbyWithScore, classify, displayScore, formatDistance, signed, errMsg,
  EXPLORE_SPOTS as SPOTS, EXPLORE_RADIUS_M, type ScoredRestaurant,
} from '@unfoodie/core';

const SPOT_KEY = 'unfoodie.spot';

export default function Explore() {
  const userId = useUser();
  if (userId === undefined) return <Center />;
  if (userId === null) return <Landing />;
  return <Nearby userId={userId} />;
}

function Landing() {
  const t = useTheme();
  const s = st(t);
  const router = useRouter();
  const cells: [string, string, 'good' | 'bad' | 'warn'][] = [
    ['推薦', '你信嘅人讚', 'good'], ['避', '你信嘅人彈', 'bad'],
    ['可疑', '淨係得你唔信嘅人讚', 'bad'], ['反而值得試', '你唔信嘅人彈', 'warn'],
  ];
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 20, paddingTop: 28 }}>
      <Text style={s.hero}>你唔使判斷邊間舖好食{'\n'}—— 你只需要判斷你信邊個。</Text>
      <Text style={[s.sub, { marginTop: 10 }]}>
        畀每個食評人一個信任等級，由 +10 到 −10。每間舖用你自己嘅名單計分，同大眾評分冇關。
      </Text>
      <View style={s.grid}>
        {cells.map(([label, desc, tone]) => (
          <View key={label} style={[s.cell, { backgroundColor: toneBg(t, tone) }]}>
            <Text style={[s.cellH, { color: toneColor(t, tone) }]}>{label}</Text>
            <Text style={{ color: toneColor(t, tone), fontSize: 12.5, opacity: 0.85 }}>{desc}</Text>
          </View>
        ))}
      </View>
      <Text style={s.note}>
        「可疑」係成個 app 嘅賣點：冇任何平台會話你聽，因為佢哋嘅收入都嚟自嗰班人。
      </Text>
      <Btn label="登入或者註冊" onPress={() => router.push('/login')} style={{ marginTop: 22 }} />
    </ScrollView>
  );
}

function Nearby({ userId }: { userId: string }) {
  const t = useTheme();
  const s = st(t);
  const router = useRouter();

  const [spot, setSpot] = useState(0);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [rows, setRows] = useState<ScoredRestaurant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SPOT_KEY).then((v) => {
      const n = Number(v);
      if (n > 0 && n < SPOTS.length) setSpot(n);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const p = SPOTS[spot];
    setErr(null);
    try {
      setRows(await nearbyWithScore(db(), userId, p.lat, p.lng, EXPLORE_RADIUS_M));
    } catch (e) {
      setErr(errMsg(e));
      setRows([]);
    }
  }, [userId, spot]);

  useEffect(() => { setRows(null); load(); }, [load]);

  function pick(i: number) {
    setSpot(i);
    AsyncStorage.setItem(SPOT_KEY, String(i)).catch(() => {});
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const withSignal = (rows ?? []).filter((r) => r.n_signal > 0);
  const noSignal   = (rows ?? []).filter((r) => r.n_signal === 0);
  const open = (id: string) => router.push(`/r/${id}`);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={s.controls}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6, paddingHorizontal: 14 }}>
          {SPOTS.map((x, i) => (
            <Pressable key={x.name} onPress={() => pick(i)} accessibilityRole="button"
                       accessibilityState={{ selected: i === spot }}
                       style={[s.chip, i === spot && { backgroundColor: t.accent, borderColor: t.accent }]}>
              <Text style={[s.chipTx, i === spot && { color: t.onAccent, fontWeight: '600' }]}>{x.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={s.row2}>
          <Text style={s.count}>
            {err ? '' : rows ? `${withSignal.length} 間有訊號 · ${noSignal.length} 間未知` : '載入中…'}
          </Text>
          <View style={s.seg}>
            {(['list', 'map'] as const).map((v) => (
              <Pressable key={v} onPress={() => setView(v)} accessibilityRole="button"
                         accessibilityState={{ selected: view === v }}
                         style={[s.segBtn, view === v && { backgroundColor: t.accent }]}>
                <Text style={[s.chipTx, view === v && { color: t.onAccent, fontWeight: '600' }]}>{v === 'list' ? '清單' : '地圖'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {err && <View style={{ paddingHorizontal: 14 }}><Banner kind="err">載入唔到附近餐廳：{err}</Banner></View>}

      {!rows ? (
        <Center />
      ) : view === 'map' ? (
        <ScoreMap rows={rows} lat={SPOTS[spot].lat} lng={SPOTS[spot].lng} onOpen={open} />
      ) : (
        <SectionList
          sections={[
            { key: 'sig', title: null, data: withSignal },
            { key: 'none', title: noSignal.length ? '你名單入面冇人講過' : null, data: noSignal },
          ]}
          keyExtractor={(r) => r.restaurant_id}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={withSignal.length === 0 && rows.length > 0 ? (
            <Banner kind="hint">呢度啲舖你名單入面未有人講過。去「食評人」揀幾個你信（或者唔信）嘅人，排序先會有意思。</Banner>
          ) : null}
          ListEmptyComponent={<Text style={s.empty}>呢個範圍內未有餐廳資料</Text>}
          renderSectionHeader={({ section }) => section.title ? <Text style={s.h2}>{section.title}</Text> : null}
          renderItem={({ item }) => <Card r={item} onPress={() => open(item.restaurant_id)} />}
        />
      )}
    </View>
  );
}

function Card({ r, onPress, floating }: { r: ScoredRestaurant; onPress: () => void; floating?: boolean }) {
  const t = useTheme();
  const s = st(t);
  const sig = classify(r);
  const norm = displayScore(r);
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
               style={({ pressed }) => [s.card, floating && s.floating, pressed && { opacity: 0.75 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={s.name} numberOfLines={1}>{r.name}</Text>
        <Text style={s.dist}>{formatDistance(r.distance_m)}</Text>
        <Text style={[s.score, { color: norm === null ? t.inkFaint : toneColor(t, sig.tone) }]}>
          {norm !== null ? signed(norm, 2) : '—'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 7 }}>
        <Badge tone={sig.tone}>{sig.label}</Badge>
        <Text style={s.detail} numberOfLines={2}>{sig.detail}</Text>
      </View>
      {r.n_signal > 0 && (
        <View style={s.quad}>
          {r.trusted_pos    > 0 && <Quad tone="good" label={`信 · 讚 ${r.trusted_pos}`} />}
          {r.trusted_neg    > 0 && <Quad tone="bad"  label={`信 · 彈 ${r.trusted_neg}`} />}
          {r.distrusted_pos > 0 && <Quad tone="bad"  label={`唔信 · 讚 ${r.distrusted_pos}`} />}
          {r.distrusted_neg > 0 && <Quad tone="good" label={`唔信 · 彈 ${r.distrusted_neg}`} />}
          {r.unknown_pos    > 0 && <Quad tone="neutral" label={`未評 · 讚 ${r.unknown_pos}`} />}
        </View>
      )}
    </Pressable>
  );
}

function Quad({ tone, label }: { tone: 'good' | 'bad' | 'neutral'; label: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: toneBg(t, tone), borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: tone === 'neutral' ? t.inkSoft : toneColor(t, tone), fontSize: 11.5, fontVariant: ['tabular-nums'] }}>
        {label}
      </Text>
    </View>
  );
}

function ScoreMap({
  rows, lat, lng, onOpen,
}: { rows: ScoredRestaurant[]; lat: number; lng: number; onOpen: (id: string) => void }) {
  const t = useTheme();
  const s = st(t);
  const map = useRef<MapView>(null);
  const [selected, setSelected] = useState<ScoredRestaurant | null>(null);

  // 令全部餐廳都喺畫面入面
  const fit = useCallback(() => {
    const coords = [{ latitude: lat, longitude: lng }, ...rows.map((r) => ({ latitude: r.lat, longitude: r.lng }))];
    map.current?.fitToCoordinates(coords, {
      edgePadding: { top: 70, right: 50, bottom: 170, left: 50 }, animated: false,
    });
  }, [rows, lat, lng]);

  useEffect(() => { setSelected(null); fit(); }, [fit]);

  // 冇訊號嘅先畫,有訊號嘅後畫 —— 疊埋嗰陣重要嘅喺上面
  const ordered = [...rows].sort((a, b) => Number(a.n_signal > 0) - Number(b.n_signal > 0));

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        onMapReady={fit}
        onPress={() => setSelected(null)}
        userInterfaceStyle={t.isDark ? 'dark' : 'light'}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
      >
        {ordered.map((r) => {
          const sig = classify(r);
          const has = r.n_signal > 0;
          const on = selected?.restaurant_id === r.restaurant_id;
          return (
            <Marker
              key={r.restaurant_id}
              coordinate={{ latitude: r.lat, longitude: r.lng }}
              onPress={(e) => { e.stopPropagation(); setSelected(r); }}
              accessibilityLabel={`${r.name}:${sig.label}`}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={on ? 3 : has ? 2 : 1}
            >
              {has ? (
                <View style={[s.pill, { backgroundColor: toneFill(t, sig.tone) }, on && s.pillOn]}>
                  <Text style={[s.pillTx, { color: '#ffffff' }]}>{sig.label}</Text>
                </View>
              ) : (
                <View style={[s.dot, { backgroundColor: t.quiet }]} />
              )}
            </Marker>
          );
        })}
      </MapView>

      <View style={s.legend} pointerEvents="none">
        {([['good', '推薦'], ['bad', '避／可疑'], ['warn', '值得試'], ['neutral', '未知']] as const).map(([tone, label]) => (
          <View key={tone} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={[s.legendDot, { backgroundColor: toneFill(t, tone) }]} />
            <Text style={{ color: t.inkSoft, fontSize: 11.5 }}>{label}</Text>
          </View>
        ))}
      </View>

      {selected && (
        <View style={s.sheet}>
          <Card r={selected} floating onPress={() => onOpen(selected.restaurant_id)} />
        </View>
      )}
    </View>
  );
}

const st = (t: Theme) => StyleSheet.create({
  hero: { fontSize: 26, fontWeight: '500', color: t.ink, lineHeight: 34, fontFamily: SERIF },
  sub: { color: t.inkSoft, fontSize: 14, lineHeight: 21 },
  note: { color: t.inkSoft, fontSize: 13, lineHeight: 19, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22, marginBottom: 10 },
  cell: { width: '48%', flexGrow: 1, borderRadius: 11, padding: 12 },
  cellH: { fontSize: 15, fontWeight: '700', marginBottom: 2 },

  controls: { paddingTop: 10, paddingBottom: 6, gap: 10 },
  row2: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  count: { color: t.inkSoft, fontSize: 12.5, flex: 1 },
  chip: { borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6, backgroundColor: t.surface },
  chipTx: { color: t.inkSoft, fontSize: 13 },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: t.line, borderRadius: 8, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 13, paddingVertical: 6 },

  h2: { color: t.inkSoft, fontSize: 14, fontWeight: '600', marginTop: 18, marginBottom: 9 },
  empty: { color: t.inkFaint, textAlign: 'center', paddingVertical: 30 },

  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 14, padding: 14, marginBottom: 9 },
  floating: { marginBottom: 0, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  name: { fontSize: 17, fontWeight: '600', color: t.ink, flexShrink: 1, fontFamily: SERIF },
  dist: { fontSize: 12, color: t.inkFaint, fontVariant: ['tabular-nums'] },
  score: { marginLeft: 'auto', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  detail: { color: t.inkSoft, fontSize: 13, flexShrink: 1 },
  quad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },

  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 2, borderColor: t.bg },
  pillOn: { transform: [{ scale: 1.15 }], borderColor: t.accent },
  pillTx: { fontSize: 12, fontWeight: '700' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: t.surface },
  legend: {
    position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 10,
    backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 6, opacity: 0.95,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  sheet: { position: 'absolute', left: 12, right: 12, bottom: 14 },
});
