import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '@/lib/db';
import { useTheme, type Theme } from '@/lib/theme';

export default function Login() {
  const t = useTheme();
  const s = st(t);
  const router = useRouter();
  const [email, setEmail] = useState('demo@unfoodie.local');
  const [pw, setPw] = useState('demo1234');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true); setErr(null);
    const { error } = await db().auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr(error.message);
    else router.replace('/');
  }

  return (
    <View style={s.wrap}>
      <Text style={s.p}>你嘅信任名單只屬於你 —— 由 Postgres RLS 鎖死。</Text>
      <TextInput style={s.input} value={email} onChangeText={setEmail}
        autoCapitalize="none" keyboardType="email-address" placeholder="email"
        placeholderTextColor={t.inkFaint} />
      <TextInput style={s.input} value={pw} onChangeText={setPw}
        secureTextEntry placeholder="密碼" placeholderTextColor={t.inkFaint} />
      {err && <Text style={{ color: t.bad, fontSize: 13 }}>{err}</Text>}
      <Pressable style={s.btn} onPress={go} disabled={busy}>
        <Text style={{ color: t.bg, fontWeight: '600' }}>{busy ? '…' : '登入'}</Text>
      </Pressable>
    </View>
  );
}

const st = (t: Theme) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: t.bg, padding: 20, gap: 10, justifyContent: 'center' },
  p: { color: t.inkSoft, fontSize: 13, marginBottom: 8, lineHeight: 19 },
  input: { borderWidth: 1, borderColor: t.line, borderRadius: 9, padding: 12,
           color: t.ink, backgroundColor: t.surface, fontSize: 15 },
  btn: { backgroundColor: t.ink, borderRadius: 9, padding: 13, alignItems: 'center', marginTop: 4 },
});
