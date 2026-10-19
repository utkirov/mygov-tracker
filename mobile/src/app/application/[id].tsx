import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Empty, StatusDot, Tag } from '@/components/ui';
import { api, UnauthorizedError, type Application, type StatusHistoryEntry } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CHANGE_FIELD_LABELS, formatDate, statusInfo, statusType } from '@/lib/status';
import { font, radius, useTheme } from '@/lib/theme';

export default function ApplicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { expire } = useAuth();
  const [app, setApp] = useState<Application | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.application(id);
      setApp(data.application);
      setHistory(data.history);
      setError(null);
    } catch (e) {
      if (e instanceof UnauthorizedError) expire();
      else setError(e instanceof Error ? e.message : 'Нет связи с сервером');
    }
  }, [id, expire]);

  useEffect(() => { void load(); }, [load]);

  async function check() {
    setChecking(true);
    try {
      await api.check(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Проверка не удалась');
    } finally {
      setChecking(false);
    }
  }

  if (!app) return <Empty text={error ?? 'Загрузка…'} />;
  const s = statusInfo(app.status, t);
  const completed = statusType(app) === 'completed' || app.archived;

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Card style={{ gap: 12 }}>
        <Text style={[styles.number, { color: t.textMuted }]}>№ {app.application_number}</Text>
        <Text style={[styles.title, { color: t.text }]}>{app.object_name || app.service_name}</Text>
        {!!app.object_name && <Text style={[styles.text, { color: t.textSoft }]}>{app.service_name}</Text>}
        <View style={styles.grid}>
          <Cell label="Статус"><StatusDot color={s.color} label={s.label} /></Cell>
          <Cell label="Действует"><Text style={[styles.value, { color: t.text }]}>{app.acting_party || '—'}</Text></Cell>
          <Cell label="Последнее изм."><Text style={[styles.mono, { color: t.text }]}>{formatDate(app.last_changed_date)}</Text></Cell>
          <Cell label="Проверка"><Text style={[styles.mono, { color: t.text }]}>{formatDate(app.last_checked_at)}</Text></Cell>
        </View>
        {!!app.current_action && (
          <Cell label="Текущее действие"><Text style={[styles.value, { color: t.text }]}>{app.current_action}</Text></Cell>
        )}
        {app.sync_state === 'error' && !!app.last_error && <Text style={[styles.text, { color: t.danger }]}>{app.last_error}</Text>}
        {error && <Text style={[styles.text, { color: t.danger }]}>{error}</Text>}
        {!completed && <Button title="Проверить сейчас" onPress={check} busy={checking} />}
      </Card>

      {app.last_change_summary.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Text style={[styles.section, { color: t.text }]}>Последнее изменение · {formatDate(app.last_detected_change_at)}</Text>
          <View style={styles.tags}>{app.last_change_fields.map(f => <Tag key={f}>{CHANGE_FIELD_LABELS[f] ?? f}</Tag>)}</View>
          {app.last_change_summary.map((line, i) => <Text key={i} style={[styles.text, { color: t.textSoft }]}>{line}</Text>)}
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <Text style={[styles.section, { color: t.text }]}>История статусов</Text>
        {history.length === 0 && <Text style={[styles.text, { color: t.textMuted }]}>Пока без изменений</Text>}
        {history.map(h => {
          const hs = statusInfo(h.status, t);
          return (
            <View key={h.id} style={[styles.historyRow, { borderTopColor: t.border }]}>
              <StatusDot color={hs.color} label={hs.label} />
              <Text style={[styles.mono, { color: t.textMuted }]}>{formatDate(h.recorded_at)}</Text>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );

  function Cell({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <View style={[styles.cell, { backgroundColor: t.panel }]}>
        <Text style={[styles.cellLabel, { color: t.textMuted }]}>{label}</Text>
        {children}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  number: { fontFamily: font.mono, fontSize: 12 },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26 },
  text: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { flexGrow: 1, flexBasis: '45%', borderRadius: radius.inner, padding: 10, gap: 6 },
  cellLabel: { fontFamily: font.regular, fontSize: 11 },
  value: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: font.mono, fontSize: 12 },
  section: { fontFamily: font.semibold, fontSize: 14 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 8 },
});
