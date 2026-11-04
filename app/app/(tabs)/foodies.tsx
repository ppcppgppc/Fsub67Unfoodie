import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { db, useUser } from '@/lib/db';
import { useTheme, type Theme } from '@/lib/theme';
import {
  listFoodies, setStance, tasteMatchFoodies, TIERS, tierInfo,
  type Foodie, type StanceTier, type TasteMatch,
} from '@unfoodie/core';

export default function Foodies() {
  const t = useTheme();
  const s = st(t);
  const userId = useUser();
  const [rows, setRows] = useState<Foodie[] | null>(null);
  const [matches, setMatches] = useState<TasteMatch[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [f, m] = await Promise.all([
      listFoodies(db(), userId),
      tasteMatchFoodies(db(), userId, 2).catch(() => []),
    ]);
    setRows(f); setMatches(m);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (!userId || !rows) {
    return <View style={s.center}><ActivityIndicator /></View>;
  }

  const used = (tier: StanceTier) => rows.filter((f) => f.stance?.tier === tier).length;

  async function pick(foodieId: string, tier: StanceTier | null) {
    setOpen(null);
    try {
      await setStance(db(), userId!, foodieId, tier);
      await load();
    } catch (e: any) {
      // 名額滿嘅 check_violation 會喺呢度出現 —— 直接俾用戶睇原文
      Alert.alert('入唔到', e.message ?? String(e));
    }
  }

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
      data={rows}
      keyExtractor={(f) => f.id}
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Text style={s.sub}>預設值係零。信任要你自己畀 —— 而上下兩極有名額。</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            {TIERS.filter((x) => x.quota !== null).map((x) => (
              <Text key={x.tier} style={s.quota}>{x.label} {used(x.tier)}/{x.quota}</Text>
            ))}
          </View>
        </View>
      }
      renderItem={({ item: f }) => {
        const cur = f.stance?.tier ?? null;
        const w = cur ? tierInfo(cur).weight : 0;
        const acc = f.accounts?.[0];
        const mt = matches.find((m) => m.foodie_id === f.id);
        const isOpen = open === f.id;

        return (
          <View style={s.card}>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center' }}
                       onPress={() => setOpen(isOpen ? null : f.id)}>
              <View style={{ flexShrink: 1 }}>
                <Text style={s.name}>{f.display_name}</Text>
                <Text style={s.handle}>
                  {acc ? `${acc.platform} · @${acc.handle}` : '—'}
                  {f.stance?.reason === 'taste_mismatch' ? ' · 口味相反' : ''}
                </Text>
                {mt && !cur && (
                  <Text style={s.hint}>
                    口味{mt.sim >= 0 ? '相近' : '相反'} {mt.sim.toFixed(2)}（重疊 {mt.n_overlap} 間）
                    → 建議 {tierInfo(mt.suggested_tier).label}
                  </Text>
                )}
              </View>
              <Text style={[s.w, { color: w > 0 ? t.good : w < 0 ? t.bad : t.inkFaint }]}>
                {w > 0 ? `+${w}` : w}
              </Text>
            </Pressable>

            {isOpen && (
              <View style={s.picker}>
                {TIERS.map((x) => (
                  <Pressable key={x.tier} onPress={() => pick(f.id, x.tier)}
                    style={[s.opt, cur === x.tier && { backgroundColor: t.neutralBg }]}>
                    <Text style={{ color: t.ink, fontSize: 13 }}>{x.label}</Text>
                    <Text style={{ color: x.weight > 0 ? t.good : x.weight < 0 ? t.bad : t.inkFaint,
                                   fontWeight: '700', fontSize: 13 }}>
                      {x.weight > 0 ? `+${x.weight}` : x.weight}
                    </Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => pick(f.id, null)} style={s.opt}>
                  <Text style={{ color: t.inkFaint, fontSize: 13 }}>清除</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const st = (t: Theme) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
  sub: { color: t.inkSoft, fontSize: 13, lineHeight: 19 },
  quota: { color: t.inkFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line,
          borderRadius: 12, padding: 13, marginBottom: 8 },
  name: { fontSize: 15, fontWeight: '600', color: t.ink },
  handle: { fontSize: 12, color: t.inkFaint, marginTop: 2 },
  hint: { fontSize: 12, color: t.inkSoft, marginTop: 4 },
  w: { marginLeft: 'auto', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  picker: { marginTop: 10, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 8, gap: 2 },
  opt: { flexDirection: 'row', justifyContent: 'space-between',
         paddingVertical: 8, paddingHorizontal: 10, borderRadius: 7 },
});
