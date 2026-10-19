import { Tabs } from 'expo-router';

import { font, useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.text,
        headerTitleStyle: { fontFamily: font.semibold, fontSize: 17 },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 13 },
        tabBarIconStyle: { display: 'none' },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Доска заявлений', tabBarLabel: 'Доска' }} />
      <Tabs.Screen name="archive" options={{ title: 'Архив' }} />
      <Tabs.Screen name="settings" options={{ title: 'Настройки' }} />
    </Tabs>
  );
}
