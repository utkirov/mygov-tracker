import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { API_BASE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerForPush } from '@/lib/push';
import { font, useTheme } from '@/lib/theme';

export default function SettingsScreen() {
  const t = useTheme();
  const { signOut } = useAuth();
  const [pushState, setPushState] = useState<string | null>(null);

  async function enablePush() {
    try {
      const token = await registerForPush();
      setPushState(token ? 'Уведомления включены' : 'Разрешение не выдано — включите уведомления в настройках Android');
    } catch (e) {
      setPushState(e instanceof Error ? e.message : 'Не удалось включить уведомления');
    }
  }

  function confirmSignOut() {
    Alert.alert('Выйти?', 'Этот телефон перестанет получать уведомления.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Card style={{ gap: 10 }}>
        <Text style={[styles.title, { color: t.text }]}>Уведомления</Text>
        <Text style={[styles.text, { color: t.textSoft }]}>Push приходит при каждом изменении статуса заявки.</Text>
        <Button title="Проверить разрешение" variant="secondary" onPress={enablePush} />
        {pushState && <Text style={[styles.text, { color: t.textSoft }]}>{pushState}</Text>}
      </Card>
      <Card style={{ gap: 10 }}>
        <Text style={[styles.title, { color: t.text }]}>Аккаунт</Text>
        <Row label="Сервер" value={API_BASE.replace('https://', '')} />
        <Row label="Версия" value={Constants.expoConfig?.version ?? '—'} />
        <Button title="Выйти" variant="secondary" onPress={confirmSignOut} />
      </Card>
    </ScrollView>
  );

  function Row({ label, value }: { label: string; value: string }) {
    return (
      <View style={styles.row}>
        <Text style={[styles.text, { color: t.textMuted }]}>{label}</Text>
        <Text style={[styles.text, { color: t.text }]}>{value}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  title: { fontFamily: font.semibold, fontSize: 15 },
  text: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
