import { View, Text, Pressable, StyleSheet, Linking, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '@/lib/db';
import { useUser } from '@/lib/user';
import { useTheme, type Theme } from '@/lib/theme';
import { Btn } from '@/lib/ui';

export default function Me() {
  const t = useTheme();
  const s = st(t);
  const userId = useUser();
  const router = useRouter();

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={s.wrap}>
      <View style={s.box}>
        <Text style={s.boxH}>你嘅資料</Text>
        <Text style={s.p}>
          信任名單同餐廳評分由 Postgres RLS 鎖死，唔會離開你個 account，
          唔會賣、唔會分享、唔會做 analytics。
        </Text>
        <Text style={s.p}>
          餐廳評分預設私人。口味配對淨係用評分，永遠唔會用你嘅信任名單。
        </Text>
      </View>

      <View style={s.box}>
        <Text style={s.boxH}>呢個 app 唔會做嘅嘢</Text>
        <Text style={s.p}>唔收廣告 · 唔向用戶收費 · 唔賣餐廳排名</Text>
      </View>

      <Pressable style={s.item} onPress={() => router.push('/takedown')} accessibilityRole="button">
        <Text style={s.itemTx}>要求下架</Text>
        <Text style={s.itemSub}>你係被提及嘅食評人或者餐廳？48 小時內回覆</Text>
      </Pressable>
      <Pressable style={s.item} onPress={() => Linking.openURL('https://github.com/ppcppgppc/Fsub67Unfoodie')}
                 accessibilityRole="link">
        <Text style={s.itemTx}>原始碼 ↗</Text>
        <Text style={s.itemSub}>AGPL-3.0 · Fsub 系列</Text>
      </Pressable>

      <View style={{ flex: 1 }} />
      {userId ? (
        <Btn label="登出" kind="ghost" onPress={() => { db().auth.signOut(); }} />
      ) : (
        <Btn label="登入" onPress={() => router.push('/login')} />
      )}
    </ScrollView>
  );
}

const st = (t: Theme) => StyleSheet.create({
  wrap: { flexGrow: 1, padding: 16, gap: 12 },
  box: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 14, gap: 8 },
  boxH: { fontSize: 14, fontWeight: '600', color: t.ink },
  p: { fontSize: 13, color: t.inkSoft, lineHeight: 20 },
  item: { borderWidth: 1, borderColor: t.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  itemTx: { color: t.ink, fontSize: 14.5, fontWeight: '500' },
  itemSub: { color: t.inkFaint, fontSize: 12 },
});
