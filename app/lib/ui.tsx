// 幾個畫面共用嘅細 component。樣式同 web/app/globals.css 對齊。

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { toneBg, toneColor, useTheme } from './theme';

type Tone = 'good' | 'bad' | 'warn' | 'neutral';

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[s.badge, { backgroundColor: toneBg(t, tone) }]}>
      <Text style={[s.badgeTx, { color: toneColor(t, tone) }]}>{children}</Text>
    </View>
  );
}

/** err = 紅、ok = 綠、hint = 灰 */
export function Banner({ kind, children }: { kind: 'err' | 'ok' | 'hint'; children: ReactNode }) {
  const t = useTheme();
  const tone: Tone = kind === 'err' ? 'bad' : kind === 'ok' ? 'good' : 'neutral';
  return (
    <View style={[s.banner, { backgroundColor: toneBg(t, tone) }]}
          accessibilityRole={kind === 'err' ? 'alert' : undefined}>
      <Text style={{ color: kind === 'hint' ? t.inkSoft : toneColor(t, tone), fontSize: 13, lineHeight: 19 }}>
        {children}
      </Text>
    </View>
  );
}

export function Btn({
  label, onPress, kind = 'primary', disabled, small, style,
}: {
  label: string; onPress: () => void; kind?: 'primary' | 'ghost';
  disabled?: boolean; small?: boolean; style?: ViewStyle;
}) {
  const t = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [
        s.btn, small && s.btnSm,
        primary ? { backgroundColor: t.ink } : { borderWidth: 1, borderColor: t.line },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={{ color: primary ? t.bg : t.inkSoft, fontWeight: primary ? '600' : '500', fontSize: small ? 12.5 : 15 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Center({ children }: { children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[s.center, { backgroundColor: t.bg }]}>
      {children ?? <ActivityIndicator color={t.inkSoft} />}
    </View>
  );
}

const s = StyleSheet.create({
  badge: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
  badgeTx: { fontSize: 12, fontWeight: '700' },
  banner: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 8 },
  btn: { borderRadius: 9, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center' },
  btnSm: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
});
