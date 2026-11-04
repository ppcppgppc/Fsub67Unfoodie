import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db } from '@/lib/db';
import { useTheme, SERIF, type Theme } from '@/lib/theme';
import { Banner, Btn } from '@/lib/ui';
import { mentionSummary, submitTakedown, errMsg } from '@unfoodie/core';

// 同 web/app/takedown/page.tsx 同 migration 12 嘅長度上限一致
const MAX = { name: 200, contact: 300, claim: 5000 } as const;
const ROLES = ['我係內容嘅食評人本人', '我代表被提及嘅餐廳', '配錯咗餐廳／內容有誤', '其他'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Summary = Awaited<ReturnType<typeof mentionSummary>>;

export default function Takedown() {
  const t = useTheme();
  const s = st(t);
  const router = useRouter();
  const { mention } = useLocalSearchParams<{ mention?: string }>();
  const mentionId = mention && UUID.test(mention) ? mention : null;

  const [target, setTarget] = useState<Summary>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [role, setRole] = useState<string>(ROLES[0]);
  const [claim, setClaim] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (mentionId) mentionSummary(db(), mentionId).then(setTarget).catch(() => setTarget(null));
  }, [mentionId]);

  const ok = name.trim().length > 0 && contact.trim().length >= 3 && claim.trim().length > 0;

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await submitTakedown(db(), {
        claimant_name: name,
        claimant_contact: contact,
        claim: `【${role}】\n${claim}`.slice(0, MAX.claim),
        mention_id: target?.mention_id ?? null,
        subject_foodie_id: target?.foodie_id ?? null,
      });
      setDone(true);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={[s.wrap, { justifyContent: 'center' }]}>
        <Text style={s.h1}>收到</Text>
        <Banner kind="ok">我哋已經收到你嘅請求，會喺 48 小時內用你留低嘅聯絡方法回覆。</Banner>
        <Text style={s.p}>為咗保障投訴人，提交咗嘅內容連你自己都睇唔返，亦唔會公開。</Text>
        <Btn label="完成" kind="ghost" onPress={() => router.back()} style={{ marginTop: 10 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.p}>唔使登入。我哋會喺 48 小時內回覆。你嘅聯絡資料只用嚟回覆呢個請求，唔會公開，亦唔會轉交被投訴嘅一方。</Text>

        {target && (
          <View style={s.target}>
            <Text style={s.small}>你要求處理嘅內容</Text>
            <Text style={{ color: t.ink, fontSize: 14 }}>
              <Text style={{ fontWeight: '700' }}>{target.foodie_name}</Text> 對{' '}
              <Text style={{ fontWeight: '700' }}>{target.restaurant_name}</Text> 嘅評論
            </Text>
          </View>
        )}

        <Text style={s.label}>你嘅名稱 *</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} maxLength={MAX.name} autoComplete="name" />
        <Text style={s.label}>聯絡方法（email 或電話）*</Text>
        <TextInput style={s.input} value={contact} onChangeText={setContact} maxLength={MAX.contact}
                   autoCapitalize="none" autoComplete="email" />
        <Text style={s.label}>你嘅身分</Text>
        <View style={{ gap: 6 }}>
          {ROLES.map((r) => (
            <Pressable key={r} onPress={() => setRole(r)} accessibilityRole="radio" accessibilityState={{ checked: role === r }}
                       style={[s.role, role === r && { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
              <Text style={{ color: role === r ? t.ink : t.inkSoft, fontSize: 14 }}>{r}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>請說明 *</Text>
        <TextInput style={[s.input, { minHeight: 120, textAlignVertical: 'top' }]} value={claim} onChangeText={setClaim}
                   multiline maxLength={MAX.claim - 40}
                   placeholder={target ? '邊度有問題？想我哋點處理？' : '請貼上相關 link，再講講邊度有問題、想我哋點處理。'}
                   placeholderTextColor={t.inkFaint} />
        {err && <Banner kind="err">提交唔到：{err}</Banner>}
        <Btn label={busy ? '提交緊…' : '提交'} onPress={submit} disabled={busy || !ok} style={{ marginTop: 8 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = (t: Theme) => StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: t.bg, padding: 18, gap: 6 },
  h1: { fontSize: 28, fontWeight: '500', color: t.ink, fontFamily: SERIF },
  p: { color: t.inkSoft, fontSize: 13.5, lineHeight: 20 },
  small: { color: t.inkFaint, fontSize: 12 },
  target: { borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 12, backgroundColor: t.surface, gap: 3, marginTop: 8 },
  label: { color: t.inkSoft, fontSize: 12.5, marginTop: 10 },
  input: { borderWidth: 1, borderColor: t.line, borderRadius: 9, padding: 12, color: t.ink, backgroundColor: t.surface, fontSize: 16 },
  role: { borderWidth: 1, borderColor: t.line, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
});
