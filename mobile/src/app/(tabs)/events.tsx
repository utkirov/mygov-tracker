import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Chip, Empty, OfflineBanner } from '@/components/ui';
import { api, UnauthorizedError, type Application, type BackupStatus, type CheckLogEntry } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { lastSeenAt, markEventsSeen, relevantEvents } from '@/lib/events';
import { CHANGE_FIELD_LABELS, formatAgo, formatSize, statusInfo } from '@/lib/status';
import { font, useTheme } from '@/lib/theme';

type Filter = 'all' | 'changed' | 'error';
type Row = { kind: 'log'; at: string; entry: CheckLogEntry } | { kind: 'backup'; at: string; backup: BackupStatus };

/** The last backup attempt as an event (design A6): a failure counts as an error. */
function backupRow(b: BackupStatus | null): Extract<Row, { kind: 'backup' }> | null {
  return b?.lastAttemptAt ? { kind: 'backup', at: b.lastAttemptAt, backup: b } : null;
}

export default function EventsScreen() {
  const t = useTheme();
  const { expire } = useAuth();
  const [events, setEvents] = useState<CheckLogEntry[] | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [apps, setApps] = useState<Map<string, Application>>(new Map());
  const [seenBefore, setSeenBefore] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [log, active, archived, seen, backupStatus] = await Promise.all([
        api.checkLog(100),
        api.applications(false).catch(() => null),
        api.applications(true).catch(() => null),
        lastSeenAt(),
        api.backupStatus().catch(() => null),
      ]);
      setBackup(backupStatus?.data ?? null);
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

  const shown = useMemo<Row[]>(() => {
    const rows: Row[] = (events ?? []).filter(e => filter === 'all' || e.result === filter).map(entry => ({ kind: 'log', at: entry.checked_at, entry }));
    const b = backupRow(backup);
    if (b && (filter === 'all' || (filter === 'error' && b.backup.lastError))) rows.push(b);
    return rows.sort((a, z) => z.at.localeCompare(a.at));
  }, [events, backup, filter]);
  const unread = useMemo(() => (events ?? []).filter(e => !seenBefore || e.checked_at > seenBefore).length, [events, seenBefore]);
  const backupFailed = !!backup?.lastAttemptAt && !!backup.lastError;
  const count = (f: Filter) => (events ?? []).filter(e => f === 'all' || e.result === f).length
    + (f === 'all' && backup?.lastAttemptAt ? 1 : 0) + (f === 'error' && backupFailed ? 1 : 0);

  return (
    <FlatList
      data={shown}
      keyExtractor={r => (r.kind === 'log' ? r.entry.id : 'backup')}
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
      renderItem={({ item }) => item.kind === 'backup'
        ? <BackupCard backup={item.backup} />
        : <EventCard entry={item.entry} app={apps.get(item.entry.application_id)} unread={!seenBefore || item.entry.checked_at > seenBefore} />}
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

function BackupCard({ backup }: { backup: BackupStatus }) {
  const t = useTheme();
  const failed = !!backup.lastError;
  const place = /мой диск|my drive|google/i.test(backup.dir) ? 'Google Drive' : backup.dir.split(/[\\/]/).filter(Boolean).pop() ?? backup.dir;
  return (
    <Card style={{ gap: 6 }}>
      <View style={styles.top}>
        <Text style={[styles.number, { color: t.textMuted }]}>Резервная копия</Text>
        <Text style={[styles.time, { color: t.textMuted }]}>{formatAgo(backup.lastAttemptAt)}</Text>
      </View>
      <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{place}</Text>
      <Text style={[styles.text, { color: failed ? t.danger : t.textSoft }]}>
        {failed ? `Копия не сохранена: ${backup.lastError}` : `Копия базы сохранена${backup.lastSize ? ` · ${formatSize(backup.lastSize)}` : ''}`}
      </Text>
    </Card>
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
