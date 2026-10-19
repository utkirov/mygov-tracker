import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Chip, Empty, StatusDot, Tag } from '@/components/ui';
import { api, UnauthorizedError, type Application } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CHANGE_FIELD_LABELS, formatDate, statusInfo, statusType, type StatusType } from '@/lib/status';
import { font, useTheme } from '@/lib/theme';

const FILTERS: Array<{ key: 'all' | StatusType; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'action_required', label: 'Ждёт действия' },
  { key: 'in_progress', label: 'В обработке' },
  { key: 'completed', label: 'Завершено' },
];

export function ApplicationList({ archived }: { archived: boolean }) {
  const t = useTheme();
  const { expire } = useAuth();
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | StatusType>('all');

  const load = useCallback(async () => {
    try {
      setItems(await api.applications(archived));
      setError(null);
    } catch (e) {
      if (e instanceof UnauthorizedError) expire();
      else setError(e instanceof Error ? e.message : 'Нет связи с сервером');
    }
  }, [archived, expire]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const shown = useMemo(() => (items ?? []).filter(a => filter === 'all' || statusType(a) === filter), [items, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const a of items ?? []) c[statusType(a)] = (c[statusType(a)] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <FlatList
      data={shown}
      keyExtractor={a => a.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={archived ? undefined : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map(f => (
            <Chip key={f.key} label={`${f.label} (${counts[f.key] ?? 0})`} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      )}
      ListEmptyComponent={
        error ? <Empty text={error} /> : items === null ? <Empty text="Загрузка…" /> : <Empty text={archived ? 'Архив пуст' : 'Заявлений нет'} />
      }
      renderItem={({ item }) => <ApplicationCard app={item} theme={t} />}
    />
  );
}

function ApplicationCard({ app, theme: t }: { app: Application; theme: ReturnType<typeof useTheme> }) {
  const s = statusInfo(app.status, t);
  const needsAction = statusType(app) === 'action_required';
  return (
    <Pressable onPress={() => router.push({ pathname: '/application/[id]', params: { id: app.id } })}>
      <Card style={{ gap: 8 }}>
        <View style={styles.top}>
          <Text style={[styles.number, { color: t.textMuted }]}>№ {app.application_number}</Text>
          <View style={styles.tags}>
            {app.sync_state === 'error' && <Tag tone="danger">Ошибка</Tag>}
            {app.parent_id && <Tag>Цепочка</Tag>}
          </View>
        </View>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{app.object_name || app.service_name}</Text>
        {!!app.object_name && <Text style={[styles.service, { color: t.textSoft }]} numberOfLines={2}>{app.service_name}</Text>}
        <StatusDot color={s.color} label={s.label} />
        {needsAction && <Text style={[styles.action, { color: t.danger }]}>Нужно ваше действие</Text>}
        {app.last_change_fields.length > 0 && (
          <View style={styles.tags}>
            {app.last_change_fields.map(f => <Tag key={f}>{CHANGE_FIELD_LABELS[f] ?? f}</Tag>)}
          </View>
        )}
        <View style={[styles.bottom, { borderTopColor: t.border }]}>
          <Text style={[styles.meta, { color: t.textMuted }]}>{formatDate(app.last_changed_date)}</Text>
          <Text style={[styles.meta, { color: t.textMuted }]}>Проверено {formatDate(app.last_checked_at)}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  chips: { gap: 8, paddingBottom: 6 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontFamily: font.mono, fontSize: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  service: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  action: { fontFamily: font.medium, fontSize: 12 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
  meta: { fontFamily: font.regular, fontSize: 11 },
});
