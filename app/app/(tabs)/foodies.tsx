import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { useTheme, signColor, SERIF, type Theme } from '@/lib/theme';
import { Banner, Btn, Center } from '@/lib/ui';
import {
  listFoodies, setStance, tasteMatchFoodies, TIERS, tierInfo, tierError, signed, errMsg,
  type Foodie, type StanceReason, type StanceTier, type TasteMatch,
} from '@unfoodie/core';

export default function Foodies() {
  const t = useTheme();
  const s = st(t);
  const router = useRouter();
  const userId = useUser();
  const [rows, setRows] = useState<Foodie[] | null>(null);
  const [matches, setMatches] = useState<TasteMatch[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [f, m] = await Promise.all([
        listFoodies(db(), userId),
        // 配對建議係錦上添花,失敗都唔好擋住成頁
        tasteMatchFoodies(db(), userId, 2).catch(() => [] as TasteMatch[]),
      ]);
      setRows(f); setMatches(m);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (userId === undefined) return <Center />;
  if (userId === null) {
    return (
      <Center>
        <Text style={s.sub}>要登入先可以管理你嘅名單</Text>
        <Btn label="登入" onPress={() => router.push('/login')} />
      </Center>
    );
  }
  if (!rows) return err ? <Center><Banner kind="err">{err}</Banner></Center> : <Center />;

  const used = (tier: StanceTier) => rows.filter((f) => f.stance?.tier === tier).length;

  async function pick(foodieId: string, tier: StanceTier | null, reason: StanceReason = 'manual') {
    setOpen(null); setErr(null); setBusy(foodieId);
    try {
      await setStance(db(), userId!, foodieId, tier, reason);
      await load();
    } catch (e) {
      // 名額滿嘅 check_violation 會喺呢度出現
      setErr(tierError(e));
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
      data={rows}
      keyExtractor={(f) => f.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 10 }}>
          <Text style={s.sub}>預設值係零。信任要你自己畀 —— 而上下兩極有名額。撳個名揀等級。</Text>
          <View style={s.quotas}>
            {TIERS.filter((x) => x.quota !== null).map((x) => {
              const full = used(x.tier) >= x.quota!;
              return (
                <View key={x.tier} style={[s.quota, full && { backgroundColor: t.accentSoft }]}>
                  <Text style={{ fontSize: 12, color: full ? t.accentText : t.inkSoft }}>
                    {x.label} <Text style={{ fontWeight: '700' }}>{used(x.tier)}/{x.quota}</Text>
                  </Text>
                </View>
              );
            })}
          </View>
          {err && <Banner kind="err">{err}</Banner>}
        </View>
      }
      ListFooterComponent={
        <Text style={s.foot}>
          冇名額限制嘅話，三個月後你會有四十個超級白名單，個 scale 就塌返做 ±1。
          口味配對嘅建議永遠只係建議 —— 要你撳「採納」先入名單。
        </Text>
      }
      renderItem={({ item: f }) => {
        const cur = f.stance?.tier ?? null;
        const w = cur ? tierInfo(cur).weight : 0;
        const acc = f.accounts?.[0];
        const mt = matches.find((m) => m.foodie_id === f.id);
        const isOpen = open === f.id;

        return (
          <View style={[s.card, busy === f.id && { opacity: 0.55 }]}>
            <Pressable style={s.head} onPress={() => setOpen(isOpen ? null : f.id)}
                       accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
                       accessibilityHint="揀信任等級">
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{f.display_name}</Text>
                <Text style={s.handle}>
                  {acc ? `${acc.platform} · @${acc.handle}` : '—'}
                  {f.stance?.reason === 'taste_mismatch' ? ' · 口味相反' : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.w, { color: signColor(t, w) }]}>{signed(w)}</Text>
                <Text style={s.tierLabel}>{cur ? tierInfo(cur).label : '未評'} {isOpen ? '▴' : '▾'}</Text>
              </View>
            </Pressable>

            {mt && !cur && (
              <View style={s.suggest}>
                <Text style={s.suggestTx}>
                  口味{mt.sim >= 0 ? '相近' : '相反'} <Text style={s.b}>{mt.sim.toFixed(2)}</Text>
                  （重疊 {mt.n_overlap} 間）→ 建議 <Text style={s.b}>{tierInfo(mt.suggested_tier).label}</Text>
                </Text>
                <Btn label="採納" kind="ghost" small disabled={busy === f.id}
                     onPress={() => pick(f.id, mt.suggested_tier, mt.reason)} />
              </View>
            )}

            {isOpen && (
              <View style={s.picker}>
                {TIERS.map((x) => {
                  const full = x.quota !== null && used(x.tier) >= x.quota && cur !== x.tier;
                  return (
                    <Pressable key={x.tier} onPress={() => pick(f.id, x.tier)} disabled={full}
                               accessibilityRole="radio" accessibilityState={{ checked: cur === x.tier, disabled: full }}
                               style={[s.opt, cur === x.tier && { backgroundColor: t.neutralBg }, full && { opacity: 0.4 }]}>
                      <Text style={{ color: t.ink, fontSize: 14 }}>{x.label}</Text>
                      <Text style={s.optQuota}>{x.quota !== null ? `${used(x.tier)}/${x.quota}` : ''}</Text>
                      <Text style={[s.optW, { color: signColor(t, x.weight) }]}>{signed(x.weight)}</Text>
                    </Pressable>
                  );
                })}
                {cur && (
                  <Pressable onPress={() => pick(f.id, null)} style={s.opt} accessibilityRole="button">
                    <Text style={{ color: t.inkSoft, fontSize: 14 }}>清除（返去未評）</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const st = (t: Theme) => StyleSheet.create({
  sub: { color: t.inkSoft, fontSize: 13, lineHeight: 19, textAlign: 'left' },
  quotas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  quota: { backgroundColor: t.neutralBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 13, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 16, fontWeight: '600', color: t.ink, fontFamily: SERIF },
  handle: { fontSize: 12, color: t.inkFaint, marginTop: 2 },
  w: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tierLabel: { fontSize: 11.5, color: t.inkSoft, marginTop: 1 },
  suggest: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 9,
    borderTopWidth: 1, borderTopColor: t.line, borderStyle: 'dashed',
  },
  suggestTx: { flex: 1, fontSize: 12.5, color: t.inkSoft, lineHeight: 18 },
  b: { color: t.ink, fontWeight: '600' },
  picker: { marginTop: 10, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 6, gap: 1 },
  opt: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 7 },
  optQuota: { marginLeft: 'auto', marginRight: 14, fontSize: 12, color: t.inkFaint, fontVariant: ['tabular-nums'] },
  optW: { fontWeight: '700', fontSize: 14, minWidth: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },
  foot: { color: t.inkFaint, fontSize: 12, lineHeight: 18, marginTop: 14 },
});
