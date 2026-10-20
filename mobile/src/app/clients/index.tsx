import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Empty, Field, OfflineBanner } from '@/components/ui';
import { api, type ClientSummary } from '@/lib/api';
import { font, useTheme } from '@/lib/theme';

/**
 * Клиенты. With ?pick=<applicationId> it is a picker: tapping a client assigns
 * that application to them (from the application card).
 */
export default function ClientsScreen() {
  const t = useTheme();
  const { pick: pickFor } = useLocalSearchParams<{ pick?: string }>();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ name: string; applicationIds: string[] }>>([]);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(async () => {
    try {
      const loaded = await api.clients();
      setClients(loaded.data.clients);
      setSuggestions(loaded.data.suggestions);
      setOfflineSince(loaded.offlineSince);
    } catch (e) {
      Alert.alert('Не загружено', e instanceof Error ? e.message : '');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function choose(clientId: string | null) {
    if (!pickFor) { if (clientId) router.push(`/clients/${clientId}`); return; }
    try {
      await api.setApplicationClient(pickFor, clientId);
      router.back();
    } catch (e) {
      Alert.alert('Не сохранено', e instanceof Error ? e.message : '');
    }
  }

  async function create(input: { name: string; phone?: string; applicationIds?: string[] }) {
    try {
      const { client } = await api.createClient({ ...input, applicationIds: pickFor ? [pickFor] : input.applicationIds });
      setName('');
      setPhone('');
      if (pickFor) { router.back(); return; }
      await load();
      router.push(`/clients/${client.id}`);
    } catch (e) {
      Alert.alert('Клиент не создан', e instanceof Error ? e.message : '');
    }
  }

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Stack.Screen options={{ title: pickFor ? 'Выбрать клиента' : 'Клиенты' }} />
      {offlineSince && <OfflineBanner since={offlineSince} onRetry={() => void load()} />}

      {pickFor && (
        <Pressable onPress={() => void choose(null)}>
          <Card><Text style={[styles.label, { color: t.textMuted }]}>Без клиента</Text></Card>
        </Pressable>
      )}

      {clients.length === 0 && !pickFor && <Empty text="Клиентов пока нет" />}
      {clients.map(c => (
        <Pressable key={c.id} onPress={() => void choose(c.id)}>
          <Card style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.label, { color: t.text }]}>{c.name}</Text>
              {!!c.phone && <Text style={[styles.small, { color: t.textMuted }]}>{c.phone}</Text>}
            </View>
            <Text style={[styles.small, { color: t.textMuted }]}>{c.active ? `${c.active} в работе · ` : ''}{c.total}</Text>
          </Card>
        </Pressable>
      ))}

      <Text style={[styles.section, { color: t.text }]}>{pickFor ? 'Новый клиент для заявления' : 'Новый клиент'}</Text>
      <Card style={{ gap: 10 }}>
        <Field label="Имя или компания" value={name} onChangeText={setName} />
        <Field label="Телефон (необязательно)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Button title="Создать" onPress={() => void create({ name, phone })} disabled={!name.trim()} />
      </Card>

      {!pickFor && suggestions.length > 0 && (
        <>
          <Text style={[styles.section, { color: t.text }]}>Найдены в названиях заявлений</Text>
          <Card style={{ gap: 10 }}>
            {suggestions.slice(0, 10).map(s => (
              <View key={s.name} style={styles.row}>
                <Text style={[styles.small, { color: t.text, flex: 1 }]}>{s.name} · {s.applicationIds.length}</Text>
                <Pressable onPress={() => void create({ name: s.name, applicationIds: s.applicationIds })}>
                  <Text style={[styles.small, { color: t.accent }]}>Создать</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 10, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: { fontFamily: font.semibold, fontSize: 15, marginTop: 8 },
  label: { fontFamily: font.medium, fontSize: 15 },
  small: { fontFamily: font.regular, fontSize: 13 },
});
