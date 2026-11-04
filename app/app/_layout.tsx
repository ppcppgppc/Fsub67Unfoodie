import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/lib/theme';
import { UserProvider } from '@/lib/user';

export default function RootLayout() {
  const t = useTheme();
  return (
    <UserProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTitleStyle: { color: t.ink },
          headerTintColor: t.ink,
          headerShadowVisible: false,
          headerBackTitle: '返回',
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: '登入', presentation: 'modal' }} />
        <Stack.Screen name="r/[id]" options={{ title: '' }} />
        <Stack.Screen name="takedown" options={{ title: '要求下架', presentation: 'modal' }} />
      </Stack>
    </UserProvider>
  );
}
