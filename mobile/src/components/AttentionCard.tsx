import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { api, type Attention } from '@/lib/api';
import { font, useTheme } from '@/lib/theme';

type Group = 'slow' | 'awaiting' | 'stale';

function days(v: number | null): string {
  if (v === null) return '—';
  if (v < 1) return `${Math.max(1, Math.round(v * 24))} ч`;
  return `${String(v < 10 ? Math.round(v * 10) / 10 : Math.round(v)).replace('.', ',')} дн`;
}

/** «Требует внимания» on the home screen: slower than usual / rejected, waits for a new submission / stale. */
export function AttentionCard() {
  const t = useTheme();
  const [data, setData] = useState<Attention | null>(null);
  const [open, setOpen] = useState<Group | null>(null);

  useFocusEffect(useCallback(() => {
    void api.attention().then(r => setData(r.data)).catch(() => undefined);
  }, []));

  if (!data || data.slow.length + data.awaiting.length + data.stale.length === 0) return null;
  const groups: Array<{ id: Group; label: string; count: number; color: string }> = [
    { id: 'slow', label: 'Дольше обычного', count: data.slow.length, color: t.status.processing },
    { id: 'awaiting', label: 'Ждут новой подачи', count: data.awaiting.length, color: t.danger },
    { id: 'stale', label: 'Зависли', count: data.stale.length, color: t.textMuted },
  ];
  const rows = open === null ? [] : open === 'awaiting'
    ? data.awaiting.map(a => ({ id: a.applicationId, title: a.title, sub: `отказ ${a.daysSinceRejection === null ? '—' : `${days(a.daysSinceRejection)} назад`} · подач: ${a.attempts}` }))
    : data[open].map(f => ({ id: f.applicationId, title: f.title, sub: `идёт ${days(f.elapsedDays)}${f.overdueDays ? ` · сверх срока ${days(f.overdueDays)}` : ''}` }));

  return (
    <Card style={{ gap: 10 }}>
      <Text style={[styles.title, { color: t.text }]}>Требует внимания</Text>
      <View style={styles.chips}>
        {groups.filter(g => g.count > 0).map(g => (
          <Pressable key={g.id} onPress={() => setOpen(open === g.id ? null : g.id)}
            style={[styles.chip, { backgroundColor: open === g.id ? t.primary : t.panel }]}>
            <Text style={[styles.chipText, { color: open === g.id ? t.onPrimary : g.color }]}>{g.label} · {g.count}</Text>
          </Pressable>
        ))}
      </View>
      {rows.slice(0, 8).map(r => (
        <Pressable key={r.id} onPress={() => router.push(`/application/${r.id}`)} style={[styles.row, { borderTopColor: t.border }]}>
          <Text numberOfLines={1} style={[styles.rowTitle, { color: t.text }]}>{r.title}</Text>
          <Text style={[styles.small, { color: t.textMuted }]}>{r.sub}</Text>
        </Pressable>
      ))}
      {rows.length > 8 && <Text style={[styles.small, { color: t.textMuted }]}>и ещё {rows.length - 8} — в «Сроки и аналитика»</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.semibold, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontFamily: font.medium, fontSize: 12 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 2 },
  rowTitle: { fontFamily: font.medium, fontSize: 13 },
  small: { fontFamily: font.regular, fontSize: 12 },
});
