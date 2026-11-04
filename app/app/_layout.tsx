import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/lib/theme';

export default function RootLayout() {
  const t = useTheme();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTitleStyle: { color: t.ink },
          headerTintColor: t.ink,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: '登入' }} />
        <Stack.Screen name="r/[id]" options={{ title: '' }} />
      </Stack>
    </>
  );
}
