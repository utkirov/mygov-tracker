import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ApprovalsBar } from '@/components/ChecklistCard';
import { Card, Chip, Empty, Notice, OfflineBanner, StatusDot, Tag } from '@/components/ui';
import { api, UnauthorizedError, type Application } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CHANGE_FIELD_LABELS, formatAgo, formatDate, statusInfo, statusType, type StatusType } from '@/lib/status';
import { font, radius, useTheme, type Theme } from '@/lib/theme';
import { syncWaitingReminder } from '@/lib/waiting-reminder';
import { refreshWidgets, widgetFromApplications } from '@/widget/widget-data';

const BOARD_FILTERS: Array<{ key: 'all' | StatusType; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'action_required', label: 'Ждёт' },
  { key: 'in_progress', label: 'В обработке' },
];
const ARCHIVE_FILTERS = ['Все', 'Обработано', 'Отклонено', 'Аннулировано'] as const;

type Row = { kind: 'month'; key: string; label: string } | { kind: 'app'; key: string; app: Application };

function finishedAt(app: Application): string {
  return app.last_changed_date ?? app.updated_at;
}

export function ApplicationList({ archived, header }: { archived: boolean; header?: React.ReactNode }) {
  const t = useTheme();
  const { expire } = useAuth();
  const [items, setItems] = useState<Application[] | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const loaded = await api.applications(archived);
      setItems(loaded.data);
      setOfflineSince(loaded.offlineSince);
      // Keep the home screen widget in step with what the board shows.
      if (!archived && !loaded.offlineSince) {
        void refreshWidgets(widgetFromApplications(loaded.data));
        void syncWaitingReminder(loaded.data);
      }
      setError(null);
    } catch (e) {
      if (e instanceof UnauthorizedError) expire();
      else setError(e instanceof Error ? e.message : 'Нет связи с сервером');
    }
  }, [archived, expire]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const matchesQuery = useCallback((a: Application) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [a.application_number, a.object_name, a.service_name, a.organization].join(' ').toLowerCase().includes(q);
  }, [query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const a of items ?? []) {
      const key = archived ? statusInfo(a.status, t).label : statusType(a);
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [items, archived, t]);

  const rows = useMemo<Row[]>(() => {
    const list = (items ?? []).filter(a => {
      if (!matchesQuery(a)) return false;
      if (filter === 'all') return true;
      return archived ? statusInfo(a.status, t).label === filter : statusType(a) === filter;
    });
    if (!archived) return list.map(app => ({ kind: 'app', key: app.id, app }));

    // Archive: newest first, grouped by month (design A5).
    const sorted = [...list].sort((a, b) => finishedAt(b).localeCompare(finishedAt(a)));
    const out: Row[] = [];
    let month = '';
    for (const app of sorted) {
      const d = new Date(finishedAt(app));
      const label = Number.isNaN(d.getTime()) ? 'Без даты' : d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      if (label !== month) {
        month = label;
        out.push({ kind: 'month', key: `m:${label}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
      }
      out.push({ kind: 'app', key: app.id, app });
    }
    return out;
  }, [items, filter, archived, matchesQuery, t]);

  const waiting = archived ? 0 : (counts.action_required ?? 0);
  const chips = archived
    ? ARCHIVE_FILTERS.map(label => ({ key: label === 'Все' ? 'all' : label, label: `${label} ${label === 'Все' ? counts.all : counts[label] ?? 0}` }))
    : BOARD_FILTERS.map(f => ({ key: f.key, label: `${f.label} ${counts[f.key] ?? 0}` }));

  return (
    <FlatList
      data={rows}
      keyExtractor={r => r.key}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          {header}
          {offlineSince && <OfflineBanner since={offlineSince} onRetry={() => void load()} />}
          <View style={[styles.search, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Icon name="search" size={16} color={t.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={archived ? 'Поиск в архиве' : 'Номер или объект'}
              placeholderTextColor={t.textMuted}
              style={[styles.searchInput, { color: t.text }]}
              returnKeyType="search"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {chips.map(c => <Chip key={c.key} label={c.label} active={filter === c.key} onPress={() => setFilter(c.key)} />)}
          </ScrollView>
          {waiting > 0 && filter === 'all' && !query && (
            <Pressable onPress={() => setFilter('action_required')}>
              <Notice tone="danger" text={`${waiting} ${plural(waiting, 'заявление ждёт', 'заявления ждут', 'заявлений ждут')} вашего действия`} />
            </Pressable>
          )}
        </View>
      }
      ListEmptyComponent={
        error ? <Empty text={error} /> : items === null ? <Empty text="Загрузка…" /> : <Empty text={query || filter !== 'all' ? 'Ничего не найдено' : archived ? 'Архив пуст' : 'Заявлений нет'} />
      }
      renderItem={({ item }) => item.kind === 'month'
        ? <Text style={[styles.month, { color: t.textMuted }]}>{item.label}</Text>
        : <ApplicationCard app={item.app} theme={t} archived={archived} />}
    />
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function ApplicationCard({ app, theme: t, archived }: { app: Application; theme: Theme; archived: boolean }) {
  const s = statusInfo(app.status, t);
  const needsAction = statusType(app) === 'action_required';
  return (
    <Pressable onPress={() => router.push({ pathname: '/application/[id]', params: { id: app.id } })}>
      <Card style={{ gap: 8 }}>
        <View style={styles.top}>
          <Text style={[styles.number, { color: t.textMuted }]}>
            № {app.application_number}{archived ? ` · ${new Date(finishedAt(app)).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}` : ''}
          </Text>
          <View style={styles.tags}>
            {app.sync_state === 'error' && <Tag tone="danger">Ошибка</Tag>}
            {app.parent_id && <Tag>Цепочка</Tag>}
            {archived && (app.result_documents ?? 0) > 0 && <Tag>{app.result_documents} PDF</Tag>}
          </View>
        </View>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{app.object_name || app.service_name}</Text>
        {!!app.object_name && <Text style={[styles.service, { color: t.textSoft }]} numberOfLines={2}>{app.service_name}</Text>}
        <StatusDot color={s.color} label={s.label} />
        {!!app.client && <Text style={[styles.meta, { color: t.textSoft }]} numberOfLines={1}>Клиент: {app.client.name}</Text>}
        {needsAction && !archived && <Text style={[styles.action, { color: t.danger }]}>Нужно ваше действие</Text>}
        {!!app.checklist_summary?.stage && !archived && (
          <Text style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
            Этап {app.checklist_summary.stageIndex} из {app.checklist_summary.stageCount}: {app.checklist_summary.stage}
          </Text>
        )}
        {!archived && app.forecast?.pace === 'slow' && (
          <Text style={[styles.meta, { color: t.status.processing }]} numberOfLines={2}>Дольше обычного: {app.forecast.reason}</Text>
        )}
        {!archived && app.forecast?.pace === 'on_track' && !!app.forecast.expectedAt && (
          <Text style={[styles.meta, { color: t.textMuted }]}>
            Ожидается к {new Date(app.forecast.expectedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
          </Text>
        )}
        {app.checklist_summary?.result === 'rejected' ? (
          <Text style={[styles.action, { color: t.danger }]}>✕ Отказ{app.checklist_summary.failed ? ` · не выполнено критериев: ${app.checklist_summary.failed}` : ''}</Text>
        ) : app.checklist_summary && app.checklist_summary.total > 0 ? (
          <View style={{ gap: 4 }}>
            <ApprovalsBar counts={app.checklist_summary} />
            <Text style={[styles.meta, { color: t.textMuted }]}>
              Согласования {app.checklist_summary.ok}/{app.checklist_summary.total}{app.checklist_summary.wait ? ` · ждём ${app.checklist_summary.wait}` : ''}
            </Text>
          </View>
        ) : null}
        {!archived && app.last_change_fields.length > 0 && (
          <View style={styles.tags}>
            {app.last_change_fields.map(f => <Tag key={f}>{CHANGE_FIELD_LABELS[f] ?? f}</Tag>)}
          </View>
        )}
        {!archived && (
          <View style={[styles.bottom, { borderTopColor: t.border }]}>
            <Text style={[styles.meta, { color: t.textMuted }]}>{formatDate(app.last_changed_date)}</Text>
            <Text style={[styles.meta, { color: t.textMuted }]}>проверено {formatAgo(app.last_checked_at)}</Text>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  chips: { gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.inner, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 14, paddingVertical: 0 },
  month: { fontFamily: font.semibold, fontSize: 12, marginTop: 6 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontFamily: font.mono, fontSize: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  service: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  action: { fontFamily: font.medium, fontSize: 12 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
  meta: { fontFamily: font.regular, fontSize: 11 },
});
