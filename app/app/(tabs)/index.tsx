import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { db, useUser } from '@/lib/db';
import { useTheme, toneColor, toneBg, type Theme } from '@/lib/theme';
import {
  nearbyWithScore, classify, displayScore, formatDistance,
  type ScoredRestaurant,
} from '@unfoodie/core';

const SPOTS = [
  { name: '旺角',   lat: 22.3193, lng: 114.1694 },
  { name: '中環',   lat: 22.2819, lng: 114.1582 },
  { name: '深水埗', lat: 22.3303, lng: 114.1622 },
  { name: '渋谷',   lat: 35.6595, lng: 139.7005 },
];

export default function Explore() {
  const t = useTheme();
  const s = st(t);
  const router = useRouter();
  const userId = useUser();

  const [spot, setSpot] = useState(0);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [rows, setRows] = useState<ScoredRestaurant[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    const p = SPOTS[spot];
    setRows(null);
    nearbyWithScore(db(), userId, p.lat, p.lng, 3000).then(setRows).catch(() => setRows([]));
  }, [userId, spot]);

  if (userId === undefined) return <Center><ActivityIndicator /></Center>;
  if (userId === null) {
    return (
      <Center>
        <Text style={s.h1}>UNFOODIE</Text>
        <Text style={s.sub}>你唔使判斷邊間舖好食{'\n'}你只需要判斷你信邊個</Text>
        <Pressable style={s.primary} onPress={() => router.push('/login')}>
          <Text style={s.primaryTx}>登入</Text>
        </Pressable>
      </Center>
    );
  }

  const p = SPOTS[spot];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={s.bar}>
        {SPOTS.map((x, i) => (
          <Pressable key={x.name} onPress={() => setSpot(i)}
            style={[s.chip, i === spot && { backgroundColor: t.ink }]}>
            <Text style={[s.chipTx, i === spot && { color: t.bg }]}>{x.name}</Text>
          </Pressable>
        ))}
        <Pressable style={s.seg} onPress={() => setView(view === 'list' ? 'map' : 'list')}>
          <Text style={s.chipTx}>{view === 'list' ? '地圖' : '清單'}</Text>
        </Pressable>
      </View>

      {!rows ? (
        <Center><ActivityIndicator /></Center>
      ) : view === 'map' ? (
        <MapView
          style={{ flex: 1 }}
          region={{ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        >
          {rows.map((r) => {
            const sig = classify(r);
            return (
              <Marker
                key={r.restaurant_id}
                coordinate={{ latitude: r.lat, longitude: r.lng }}
                pinColor={toneColor(t, sig.tone)}
                title={r.name}
                description={`${sig.label} — ${sig.detail}`}
                onCalloutPress={() => router.push(`/r/${r.restaurant_id}`)}
              />
            );
          })}
        </MapView>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.restaurant_id}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          renderItem={({ item: r }) => {
            const sig = classify(r);
            const norm = displayScore(r);
            return (
              <Pressable style={s.card} onPress={() => router.push(`/r/${r.restaurant_id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={s.name}>{r.name}</Text>
                  <Text style={s.dist}>  {formatDistance(r.distance_m)}</Text>
                  <Text style={[s.score, { color: toneColor(t, sig.tone) }]}>
                    {norm !== null ? (norm > 0 ? '+' : '') + norm.toFixed(2) : '—'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 7 }}>
                  <View style={[s.badge, { backgroundColor: toneBg(t, sig.tone) }]}>
                    <Text style={[s.badgeTx, { color: toneColor(t, sig.tone) }]}>{sig.label}</Text>
                  </View>
                  <Text style={s.detail} numberOfLines={1}>{sig.detail}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
                   backgroundColor: t.bg, padding: 30, gap: 12 }}>
      {children}
    </View>
  );
}

const st = (t: Theme) => StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '700', color: t.ink, letterSpacing: -0.5 },
  sub: { color: t.inkSoft, textAlign: 'center', lineHeight: 22 },
  primary: { backgroundColor: t.ink, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9, marginTop: 8 },
  primaryTx: { color: t.bg, fontWeight: '600' },

  bar: { flexDirection: 'row', gap: 7, padding: 12, flexWrap: 'wrap', alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: t.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  chipTx: { color: t.inkSoft, fontSize: 13 },
  seg: { marginLeft: 'auto', borderWidth: 1, borderColor: t.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },

  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line,
          borderRadius: 12, padding: 14, marginBottom: 9 },
  name: { fontSize: 16, fontWeight: '600', color: t.ink },
  dist: { fontSize: 12, color: t.inkFaint, fontVariant: ['tabular-nums'] },
  score: { marginLeft: 'auto', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  badge: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999 },
  badgeTx: { fontSize: 12, fontWeight: '700' },
  detail: { color: t.inkSoft, fontSize: 13, flexShrink: 1 },
});
