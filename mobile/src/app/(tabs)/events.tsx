import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Chip, Empty, OfflineBanner } from '@/components/ui';
import { api, UnauthorizedError, type Application, type CheckLogEntry } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { lastSeenAt, markEventsSeen, relevantEvents } from '@/lib/events';
import { CHANGE_FIELD_LABELS, formatAgo, statusInfo } from '@/lib/status';
import { font, useTheme } from '@/lib/theme';

type Filter = 'all' | 'changed' | 'error';

export default function EventsScreen() {
  const t = useTheme();
  const { expire } = useAuth();
  const [events, setEvents] = useState<CheckLogEntry[] | null>(null);
  const [apps, setApps] = useState<Map<string, Application>>(new Map());
  const [seenBefore, setSeenBefore] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [log, active, archived, seen] = await Promise.all([
        api.checkLog(100),
        api.applications(false).catch(() => null),
        api.applications(true).catch(() => null),
        lastSeenAt(),
      ]);
      const map = new Map<string, Application>();
      for (const a of [...(active?.data ?? []), ...(archived?.data ?? [])]) map.set(a.id, a);
      setApps(map);
      setEvents(relevantEvents(log.data));
      setOfflineSince(log.offlineSince);
      setSeenBefore(seen);
      setError(null);
      if (!log.offlineSince) void markEventsSeen();
    } catch (e) {
      if (e instanceof UnauthorizedError) expire();
      else setError(e instanceof Error ? e.message : 'Нет связи с сервером');
    }
  }, [expire]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const shown = useMemo(() => (events ?? []).filter(e => filter === 'all' || e.result === filter), [events, filter]);
  const unread = useMemo(() => (events ?? []).filter(e => !seenBefore || e.checked_at > seenBefore).length, [events, seenBefore]);
  const count = (f: Filter) => (events ?? []).filter(e => f === 'all' || e.result === f).length;

  return (
    <FlatList
      data={shown}
      keyExtractor={e => e.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          {offlineSince && <OfflineBanner since={offlineSince} onRetry={() => void load()} />}
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            {unread > 0 ? `${unread} непрочитанных` : 'Новых событий нет'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label={`Все ${count('all')}`} active={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label={`Изменения ${count('changed')}`} active={filter === 'changed'} onPress={() => setFilter('changed')} />
            <Chip label={`Ошибки ${count('error')}`} active={filter === 'error'} onPress={() => setFilter('error')} />
          </ScrollView>
        </View>
      }
      ListEmptyComponent={error ? <Empty text={error} /> : events === null ? <Empty text="Загрузка…" /> : <Empty text="Событий пока нет" />}
      renderItem={({ item }) => <EventCard entry={item} app={apps.get(item.application_id)} unread={!seenBefore || item.checked_at > seenBefore} />}
    />
  );
}

function EventCard({ entry, app, unread }: { entry: CheckLogEntry; app?: Application; unread: boolean }) {
  const t = useTheme();
  let fields: string[] = [];
  try { fields = JSON.parse(entry.changed_fields) as string[]; } catch { fields = []; }

  // The newest change of an application still has its "old → new" summary;
  // older ones only know which fields changed.
  const isLatestChange = !!app?.last_detected_change_at && Math.abs(new Date(app.last_detected_change_at).getTime() - new Date(entry.checked_at).getTime()) < 120_000;
  const description = entry.result === 'error'
    ? `Ошибка: ${entry.error_message || 'my.gov.uz не ответил'}`
    : isLatestChange && app.last_change_summary.length > 0
      ? app.last_change_summary.join(' · ')
      : fields.map(f => `${CHANGE_FIELD_LABELS[f] ?? f}${f === 'status' && app ? `: «${statusInfo(app.status, t).label}»` : ''}`).join(' · ') || 'Изменение';

  return (
    <Pressable onPress={() => router.push({ pathname: '/application/[id]', params: { id: entry.application_id } })}>
      <Card style={{ gap: 6 }}>
        <View style={styles.top}>
          <View style={styles.row}>
            {unread && <View style={[styles.dot, { backgroundColor: t.accent }]} />}
            <Text style={[styles.number, { color: t.textMuted }]}>№ {entry.application_number}</Text>
          </View>
          <Text style={[styles.time, { color: t.textMuted }]}>{formatAgo(entry.checked_at)}</Text>
        </View>
        {app && <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{app.object_name || app.service_name}</Text>}
        <Text style={[styles.text, { color: entry.result === 'error' ? t.danger : t.textSoft }]}>{description}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  chips: { gap: 8 },
  subtitle: { fontFamily: font.regular, fontSize: 13 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  number: { fontFamily: font.mono, fontSize: 12 },
  time: { fontFamily: font.regular, fontSize: 11 },
  title: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  text: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
});
