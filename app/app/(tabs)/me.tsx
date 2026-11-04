import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { db, useUser } from '@/lib/db';
import { useTheme, type Theme } from '@/lib/theme';

export default function Me() {
  const t = useTheme();
  const s = st(t);
  const userId = useUser();
  const router = useRouter();

  return (
    <View style={s.wrap}>
      <Text style={s.h}>我的</Text>

      <View style={s.box}>
        <Text style={s.boxH}>你嘅資料</Text>
        <Text style={s.p}>
          信任名單同餐廳評分由 Postgres RLS 鎖死,唔會離開你個 account,
          唔會賣、唔會分享、唔會做 analytics。
        </Text>
        <Text style={s.p}>
          餐廳評分預設私人。要 opt-in 之後先會攞去同其他人做口味配對,
          而且淨係用評分,永遠唔會用你嘅信任名單。
        </Text>
      </View>

      <View style={s.box}>
        <Text style={s.boxH}>呢個 app 唔會做嘅嘢</Text>
        <Text style={s.p}>唔收廣告 · 唔向用戶收費 · 唔賣餐廳排名</Text>
      </View>

      <Pressable onPress={() => Linking.openURL('https://fsub.app')}>
        <Text style={s.link}>Fsub 系列</Text>
      </Pressable>

      {userId ? (
        <Pressable style={s.btn} onPress={async () => { await db().auth.signOut(); }}>
          <Text style={{ color: t.inkSoft }}>登出</Text>
        </Pressable>
      ) : (
        <Pressable style={s.btn} onPress={() => router.push('/login')}>
          <Text style={{ color: t.inkSoft }}>登入</Text>
        </Pressable>
      )}
    </View>
  );
}

const st = (t: Theme) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: t.bg, padding: 18, gap: 14 },
  h: { fontSize: 24, fontWeight: '700', color: t.ink, letterSpacing: -0.5 },
  box: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line,
         borderRadius: 12, padding: 14, gap: 8 },
  boxH: { fontSize: 14, fontWeight: '600', color: t.ink },
  p: { fontSize: 13, color: t.inkSoft, lineHeight: 20 },
  link: { color: t.inkSoft, fontSize: 13, textDecorationLine: 'underline' },
  btn: { marginTop: 'auto', borderWidth: 1, borderColor: t.line, borderRadius: 9,
         padding: 12, alignItems: 'center' },
});
