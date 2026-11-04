import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTheme } from '@/lib/theme';

const icon = (ch: string) => ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 17 }}>{ch}</Text>
);

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      sceneContainerStyle={{ backgroundColor: t.bg }}
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.ink },
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.inkFaint,
      }}
    >
      <Tabs.Screen name="index"   options={{ title: '探索',   tabBarIcon: icon('◉') }} />
      <Tabs.Screen name="foodies" options={{ title: '食評人', tabBarIcon: icon('±') }} />
      <Tabs.Screen name="me"      options={{ title: '我的',   tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
