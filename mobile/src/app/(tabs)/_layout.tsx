import { Tabs } from 'expo-router';

import { Icon, type IconName } from '@/components/Icon';
import { useUnreadEvents } from '@/lib/events';
import { font, useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const unread = useUnreadEvents();
  const icon = (name: IconName) => ({ color }: { color: unknown }) => <Icon name={name} size={22} color={typeof color === 'string' ? color : t.textMuted} />;

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
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12 },
        tabBarBadgeStyle: { backgroundColor: t.danger, fontFamily: font.medium, fontSize: 10 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Доска заявлений', tabBarLabel: 'Доска', tabBarIcon: icon('board') }} />
      <Tabs.Screen name="archive" options={{ title: 'Архив', tabBarIcon: icon('archive') }} />
      <Tabs.Screen
        name="events"
        options={{ title: 'События', tabBarIcon: icon('bell'), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Настройки', tabBarIcon: icon('settings') }} />
    </Tabs>
  );
}
