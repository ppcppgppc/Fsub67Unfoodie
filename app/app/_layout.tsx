import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppearanceProvider, useTheme } from '@/lib/theme';
import { UserProvider } from '@/lib/user';

export default function RootLayout() {
  return (
    <AppearanceProvider>
      <UserProvider>
        <Root />
      </UserProvider>
    </AppearanceProvider>
  );
}

function Root() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTitleStyle: { color: t.ink },
          headerTintColor: t.accentText,
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
    </>
  );
}
