import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Field, OfflineBanner, StatusDot } from '@/components/ui';
import { api, type Application, type ClientStats, type ClientSummary } from '@/lib/api';
import { formatDays, statusInfo } from '@/lib/status';
import { font, useTheme } from '@/lib/theme';

/** Client card: contacts, numbers, applications (active first) and the client-wide share link. */
export default function ClientScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', note: '' });

  const load = useCallback(async () => {
    try {
      const loaded = await api.client(id);
      setClient(loaded.data.client);
      setApps(loaded.data.applications);
      setStats(loaded.data.stats);
      setOfflineSince(loaded.offlineSince);
      setForm({ name: loaded.data.client.name, phone: loaded.data.client.phone, note: loaded.data.client.note });
    } catch (e) {
      Alert.alert('Не загружено', e instanceof Error ? e.message : '');
    }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function save() {
    try {
      await api.updateClient(id, form);
      setEditing(false);
      await load();
    } catch (e) {
      Alert.alert('Не сохранено', e instanceof Error ? e.message : '');
    }
  }

  if (!client) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  const active = apps.filter(a => !a.archived);
  const done = apps.filter(a => a.archived);

  const Row = ({ a }: { a: Application }) => {
    const info = statusInfo(a.status, t);
    return (
      <Pressable onPress={() => router.push(`/application/${a.id}`)} style={{ gap: 2, paddingVertical: 8 }}>
        <Text style={[styles.label, { color: t.text }]} numberOfLines={2}>{a.object_name || a.service_name}</Text>
        <StatusDot color={info.color} label={`${info.label} · № ${a.application_number}`} />
        {!!a.checklist_summary?.stage && !a.archived && (
          <Text style={[styles.tiny, { color: t.textMuted }]} numberOfLines={1}>
            Этап {a.checklist_summary.stageIndex} из {a.checklist_summary.stageCount}: {a.checklist_summary.stage}
          </Text>
        )}
        {a.forecast?.pace === 'slow' && <Text style={[styles.tiny, { color: t.status.processing }]}>Дольше обычного: {a.forecast.reason}</Text>}
      </Pressable>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Stack.Screen options={{ title: client.name }} />
      {offlineSince && <OfflineBanner since={offlineSince} onRetry={() => void load()} />}

      <Card style={{ gap: 8 }}>
        {editing ? (
          <>
            <Field label="Имя" value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
            <Field label="Телефон" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
            <Field label="Заметка (видна только вам)" value={form.note} onChangeText={v => setForm({ ...form, note: v })} multiline />
            <Button title="Сохранить" onPress={() => void save()} />
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: t.text }]}>{client.name}</Text>
            {!!client.note && <Text style={[styles.small, { color: t.textSoft }]}>{client.note}</Text>}
            <View style={styles.actions}>
              {!!client.phone && (
                <Pressable onPress={() => void Linking.openURL(`tel:${client.phone.replace(/[^\d+]/g, '')}`)}>
                  <Text style={[styles.small, { color: t.accent }]}>Позвонить {client.phone}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setEditing(true)}><Text style={[styles.small, { color: t.accent }]}>Изменить</Text></Pressable>
            </View>
          </>
        )}
      </Card>

      <View style={styles.kpis}>
        {[
          ['Заявлений', String(stats?.total ?? apps.length)],
          ['В работе', String(active.length)],
          ['Одобрено', stats?.approvalRate == null ? '—' : `${stats.approvalRate}%`],
          ['Срок', formatDays(stats?.duration?.median)],
        ].map(([label, value]) => (
          <Card key={label} style={{ flex: 1, minWidth: 70, gap: 2 }}>
            <Text style={[styles.tiny, { color: t.textMuted }]}>{label}</Text>
            <Text style={[styles.kpi, { color: t.text }]}>{value}</Text>
          </Card>
        ))}
      </View>

      <Button title="Отправить ссылку на все заявления" onPress={() => router.push({ pathname: '/share', params: { client: id, title: client.name } })} disabled={!!offlineSince} />

      <Text style={[styles.section, { color: t.text }]}>В работе · {active.length}</Text>
      <Card>{active.length ? active.map(a => <Row key={a.id} a={a} />) : <Text style={[styles.small, { color: t.textMuted }]}>Нет активных</Text>}</Card>

      {done.length > 0 && (
        <>
          <Text style={[styles.section, { color: t.text }]}>Завершённые · {done.length}</Text>
          <Card>{done.map(a => <Row key={a.id} a={a} />)}</Card>
        </>
      )}
      <Text style={[styles.tiny, { color: t.textMuted }]}>Заявление привязывается к клиенту в его карточке («Клиент»). Повторные подачи попадают сюда сами.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 10, paddingBottom: 40 },
  kpis: { flexDirection: 'row', gap: 8 },
  actions: { flexDirection: 'row', gap: 18, flexWrap: 'wrap' },
  title: { fontFamily: font.semibold, fontSize: 18 },
  kpi: { fontFamily: font.semibold, fontSize: 16 },
  section: { fontFamily: font.semibold, fontSize: 15, marginTop: 6 },
  label: { fontFamily: font.medium, fontSize: 14 },
  small: { fontFamily: font.regular, fontSize: 13 },
  tiny: { fontFamily: font.regular, fontSize: 11 },
});
