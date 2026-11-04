import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { useTheme, SERIF, type Theme } from '@/lib/theme';
import { Banner, Btn } from '@/lib/ui';

export default function Login() {
  const t = useTheme();
  const s = st(t);
  const router = useRouter();
  const userId = useUser();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  // 示範帳號只可以喺 dev build 預填
  const [email, setEmail] = useState(__DEV__ ? 'demo@unfoodie.local' : '');
  const [pw, setPw] = useState(__DEV__ ? 'demo1234' : '');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 登入咗就閂返呢個 modal
  useEffect(() => { if (userId) router.canGoBack() ? router.back() : router.replace('/'); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    setBusy(true); setErr(null); setNote(null);
    try {
      if (mode === 'in') {
        const { error } = await db().auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) setErr(error.message);
        return;
      }
      if (pw.length < 8) { setErr('密碼最少要 8 個字'); return; }
      const { data, error } = await db().auth.signUp({ email: email.trim(), password: pw });
      if (error) setErr(error.message);
      else if (!data.session) setNote('已經寄咗確認信，撳信入面條 link 之後返嚟登入。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.h1}>{mode === 'in' ? '登入' : '註冊'}</Text>
      <Text style={s.p}>你嘅信任名單只屬於你，其他用戶讀唔到。</Text>
      <Text style={s.label}>Email</Text>
      <TextInput style={s.input} value={email} onChangeText={setEmail}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address"
        textContentType="username" returnKeyType="next" />
      <Text style={s.label}>密碼</Text>
      <TextInput style={s.input} value={pw} onChangeText={setPw}
        secureTextEntry placeholder="最少 8 個字" placeholderTextColor={t.inkFaint}
        textContentType={mode === 'in' ? 'password' : 'newPassword'}
        returnKeyType="go" onSubmitEditing={go} />
      {err && <Banner kind="err">{err}</Banner>}
      {note && <Banner kind="ok">{note}</Banner>}
      <Btn label={busy ? '處理緊…' : mode === 'in' ? '登入' : '註冊'} onPress={go} disabled={busy || !email || !pw}
           style={{ marginTop: 6 }} />
      <Pressable onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(null); setNote(null); }}
                 style={{ alignSelf: 'center', padding: 10 }} accessibilityRole="button">
        <Text style={s.toggle}>{mode === 'in' ? '未有帳號？註冊' : '已經有帳號？登入'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const st = (t: Theme) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: t.bg, padding: 22, gap: 6, justifyContent: 'center' },
  h1: { fontSize: 28, fontWeight: '500', color: t.ink, fontFamily: SERIF },
  p: { color: t.inkSoft, fontSize: 13.5, marginBottom: 14, lineHeight: 19 },
  label: { color: t.inkSoft, fontSize: 12.5, marginTop: 6 },
  input: {
    borderWidth: 1, borderColor: t.line, borderRadius: 9, padding: 12,
    color: t.ink, backgroundColor: t.surface, fontSize: 16,
  },
  toggle: { color: t.accentText, fontSize: 13.5, textDecorationLine: 'underline' },
});
