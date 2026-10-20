import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Checklist, ProgressStep } from '@/lib/api';
import { font, useTheme } from '@/lib/theme';

function shortDate(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]} ${m[4]}:${m[5]}` : value;
}

/** «На какой стадии находится заявка?» — the portal's stepper; untaken branches hidden by default. */
export function StageStepper({ checklist }: { checklist: Pick<Checklist, 'progress' | 'outcome'> }) {
  const t = useTheme();
  const [showSkipped, setShowSkipped] = useState(false);
  const progress = checklist.progress ?? [];
  const skipped = progress.filter(s => s.state === 'skipped').length;
  const steps = progress.filter(s => showSkipped || s.state !== 'skipped');
  if (steps.length === 0) return null;
  const outcome = checklist.outcome === 'rejected' ? { label: 'Отклонено', color: t.danger, mark: '✕' }
    : checklist.outcome === 'approved' ? { label: 'Обработано', color: t.status.done, mark: '✓' } : null;

  const dot = (s: ProgressStep) => s.state === 'done' ? { bg: t.status.done, fg: '#fff', mark: '✓', border: t.status.done }
    : s.state === 'current' ? { bg: t.status.processing, fg: '#fff', mark: '•••', border: t.status.processing }
      : s.state === 'pending' ? { bg: t.panel, fg: t.textMuted, mark: '', border: t.border }
        : { bg: 'transparent', fg: t.textMuted, mark: '–', border: t.border };

  return (
    <View style={{ gap: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {steps.map((s, i) => {
          const d = dot(s);
          const next = steps[i + 1];
          const lineDone = s.state === 'done' && (!next || next.state === 'done' || next.state === 'current');
          return (
            <View key={`${s.title}-${i}`} style={styles.row}>
              <View style={styles.step}>
                <View style={[styles.circle, { backgroundColor: d.bg, borderColor: d.border, borderStyle: s.state === 'skipped' ? 'dashed' : 'solid' }]}>
                  <Text style={[styles.mark, { color: d.fg }]}>{d.mark}</Text>
                </View>
                <Text numberOfLines={2} style={[styles.title, { color: s.state === 'done' || s.state === 'current' ? t.text : t.textMuted }]}>{s.title}</Text>
                {!!s.date && <Text style={[styles.date, { color: t.textMuted }]}>{shortDate(s.date)}</Text>}
              </View>
              {(next || outcome) && <View style={[styles.line, { backgroundColor: lineDone ? t.status.done : t.border }]} />}
            </View>
          );
        })}
        {outcome && (
          <View style={styles.step}>
            <View style={[styles.circle, { backgroundColor: outcome.color, borderColor: outcome.color }]}>
              <Text style={[styles.mark, { color: '#fff' }]}>{outcome.mark}</Text>
            </View>
            <Text style={[styles.title, { color: outcome.color, fontFamily: font.semibold }]}>{outcome.label}</Text>
          </View>
        )}
      </ScrollView>
      {skipped > 0 && (
        <Pressable onPress={() => setShowSkipped(v => !v)}>
          <Text style={[styles.date, { color: t.accent }]}>{showSkipped ? 'Скрыть другие ветки' : `Другие возможные этапы (${skipped})`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { width: 86, alignItems: 'center', gap: 4 },
  circle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { fontFamily: font.semibold, fontSize: 12 },
  title: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, textAlign: 'center' },
  date: { fontFamily: font.regular, fontSize: 10 },
  line: { width: 18, height: 3, borderRadius: 2, marginTop: 14 },
});
