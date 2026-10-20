import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import type { ApprovalStatus, Checklist } from '@/lib/api';
import { font, radius, useTheme, type Theme } from '@/lib/theme';

const LABEL: Record<ApprovalStatus, string> = { ok: 'Согласовано', bad: 'Отказ', other: 'Ответ', wait: 'Ожидается ответ' };

function color(t: Theme, s: ApprovalStatus): string {
  return s === 'ok' ? t.status.done : s === 'bad' ? t.danger : s === 'other' ? t.textMuted : t.border;
}

export function ApprovalsBar({ counts }: { counts: Record<ApprovalStatus, number> }) {
  const t = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: t.panel }]}>
      {(['ok', 'other', 'bad', 'wait'] as const).map(k => counts[k] > 0
        ? <View key={k} style={{ flex: counts[k], backgroundColor: color(t, k) }} />
        : null)}
    </View>
  );
}

/** «Чек-лист» from the browser extension: who approved, who is pending, why it was rejected. */
export function ChecklistCard({ checklist, onRefresh, busy }: { checklist: Checklist | null; onRefresh: () => void; busy: boolean }) {
  const t = useTheme();
  const [allCriteria, setAllCriteria] = useState(false);
  const [openText, setOpenText] = useState<number | null>(0);

  const head = (
    <View style={styles.head}>
      <Text style={[styles.section, { color: t.text }]}>Согласования</Text>
      <Pressable onPress={onRefresh} disabled={busy} hitSlop={8}>
        <Text style={[styles.small, { color: t.accent }]}>{busy ? 'Обновляю…' : 'Обновить'}</Text>
      </Pressable>
    </View>
  );
  if (!checklist) {
    return (
      <Card style={{ gap: 8 }}>
        {head}
        <Text style={[styles.small, { color: t.textMuted }]}>Появятся после следующей проверки.</Text>
      </Card>
    );
  }
  const { counts, orgs, result } = checklist;
  const failed = result?.criteria.filter(c => c.status === 'bad') ?? [];
  const criteria = allCriteria ? result?.criteria ?? [] : failed;

  return (
    <Card style={{ gap: 10 }}>
      {head}
      {counts.total > 0 && (
        <Text style={[styles.small, { color: t.textSoft }]}>
          {counts.ok} из {counts.total} согласовано{counts.bad ? ` · отказ ${counts.bad}` : ''}{counts.wait ? ` · ждём ${counts.wait}` : ''}
        </Text>
      )}

      {result && (
        <View style={[styles.result, { backgroundColor: t.panel, borderLeftColor: result.kind === 'rejected' ? t.danger : t.status.done }]}>
          <Text style={[styles.label, { color: result.kind === 'rejected' ? t.danger : t.status.done }]}>
            {result.kind === 'rejected' ? '✕ Отказ' : '✓ Заключение выдано'}{result.number ? ` · № ${result.number}` : ''}
          </Text>
          <Text style={[styles.small, { color: t.textMuted }]}>{[result.stage, result.date].filter(Boolean).join(' · ')}</Text>
          {criteria.map(c => (
            <View key={c.label} style={styles.crit}>
              <Text style={[styles.small, { color: color(t, c.status), fontFamily: font.semibold }]}>{c.status === 'bad' ? '✕' : '✓'}</Text>
              <Text style={[styles.small, { color: t.text, flex: 1 }]}>{c.label}</Text>
            </View>
          ))}
          {result.criteria.length > failed.length && (
            <Pressable onPress={() => setAllCriteria(v => !v)}>
              <Text style={[styles.small, { color: t.accent }]}>{allCriteria ? 'Только невыполненные' : `Все критерии (${result.criteria.length})`}</Text>
            </Pressable>
          )}
          {result.texts.map((x, i) => (
            <Pressable key={i} onPress={() => setOpenText(openText === i ? null : i)} style={[styles.text, { backgroundColor: t.surface }]}>
              <Text style={[styles.label, { color: t.text }]}>{x.label} {openText === i ? '▴' : '▾'}</Text>
              {openText === i && <Text style={[styles.small, { color: t.textSoft }]}>{x.text}</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {counts.total > 0 && <ApprovalsBar counts={counts} />}
      {orgs.map(o => (
        <View key={o.name} style={[styles.org, { borderTopColor: t.border }]}>
          <View style={[styles.dot, { backgroundColor: color(t, o.status) }]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.label, { color: t.text }]}>{o.name}</Text>
            <Text style={[styles.small, { color: t.textMuted }]}>
              {o.status === 'wait' ? LABEL.wait : [o.verdict || LABEL[o.status], o.date].filter(Boolean).join(' · ')}
            </Text>
            {!!o.comment && o.comment !== o.verdict && <Text style={[styles.small, { color: t.textSoft }]}>{o.comment}</Text>}
          </View>
        </View>
      ))}
      {counts.total === 0 && !result && (
        <Text style={[styles.small, { color: t.textMuted }]}>По этой услуге согласования с комиссиями не проводятся.</Text>
      )}
      {!!checklist.correction && <Text style={[styles.small, { color: t.textSoft }]}>Исправление заявки: {checklist.correction}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { fontFamily: font.semibold, fontSize: 14 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: font.regular, fontSize: 12, lineHeight: 17 },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
  result: { borderLeftWidth: 3, borderRadius: radius.inner, padding: 10, gap: 6 },
  crit: { flexDirection: 'row', gap: 6 },
  text: { borderRadius: 6, padding: 8, gap: 4 },
  org: { flexDirection: 'row', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
});
