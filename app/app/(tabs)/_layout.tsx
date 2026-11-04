import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const icon = (on: IconName, off: IconName) =>
  ({ color, focused, size }: { color: string; focused: boolean; size: number }) => (
    <Ionicons name={focused ? on : off} color={color} size={size - 2} />
  );

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      sceneContainerStyle={{ backgroundColor: t.bg }}
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.ink },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.inkFaint,
      }}
    >
      <Tabs.Screen name="index"   options={{ title: '探索',   tabBarIcon: icon('compass', 'compass-outline') }} />
      <Tabs.Screen name="foodies" options={{ title: '食評人', tabBarIcon: icon('people', 'people-outline') }} />
      <Tabs.Screen name="me"      options={{ title: '我的',   tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
