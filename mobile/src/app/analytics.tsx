import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Notice } from '@/components/ui';
import { api, type Analytics, type DurationStats } from '@/lib/api';
import { formatDays as days } from '@/lib/status';
import { font, useTheme } from '@/lib/theme';

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

/** «Сроки и аналитика» — same data as the website's /analytics (lib/analytics.ts on the server). */
export default function AnalyticsScreen() {
  const t = useTheme();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData((await api.analytics()).data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!data) {
    return <View style={[styles.screen, { backgroundColor: t.bg }]}>{error ? <Notice text={error} tone="danger" /> : <Text style={{ color: t.textMuted }}>Загрузка…</Text>}</View>;
  }

  const tt = data.totals;
  const slow = data.forecasts.filter(f => f.pace === 'slow');
  const stages = data.stages.filter(s => s.p80 >= 0.05).slice(0, 8);
  const stageMax = Math.max(...stages.map(s => s.p80), 1);
  const orgs = data.orgs.slice(0, 10);

  const Bar = ({ d, max }: { d: DurationStats; max: number }) => (
    <View style={[styles.bar, { backgroundColor: t.panel }]}>
      <View style={[styles.barFill, { width: `${Math.min(100, (d.p80 / max) * 100)}%`, backgroundColor: t.accent, opacity: 0.25 }]} />
      <View style={[styles.barFill, { width: `${Math.min(100, (d.median / max) * 100)}%`, backgroundColor: t.accent }]} />
    </View>
  );
  const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <Card style={{ flex: 1, gap: 2, minWidth: 140 }}>
      <Text style={[styles.small, { color: t.textMuted }]}>{label}</Text>
      <Text style={[styles.kpi, { color: t.text }]}>{value}</Text>
      {!!sub && <Text style={[styles.tiny, { color: t.textMuted }]}>{sub}</Text>}
    </Card>
  );

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Text style={[styles.small, { color: t.textMuted }]}>
        По {tt.applications} заявлениям. Медиана — половина уложилась в этот срок, «до» — 80%.
      </Text>
      <View style={styles.kpis}>
        <Kpi label="Одобрено" value={pct(tt.approvalRate)} sub={`${tt.approved} из ${tt.approved + tt.rejected}`} />
        <Kpi label="Срок до решения" value={days(tt.duration?.median)} sub={tt.duration ? `обычно до ${days(tt.duration.p80)}` : undefined} />
        <Kpi label="Одобрение / отказ" value={`${days(tt.approvedDuration?.median)} / ${days(tt.rejectedDuration?.median)}`} />
        <Kpi label="Дольше обычного" value={String(slow.length)} sub={`из ${tt.active} в работе`} />
      </View>

      <Text style={[styles.section, { color: t.text }]}>В работе — прогноз</Text>
      <Card style={{ gap: 10 }}>
        {data.forecasts.map(f => (
          <Pressable key={f.applicationId} onPress={() => router.push(`/application/${f.applicationId}`)} style={{ gap: 2 }}>
            <Text style={[styles.label, { color: t.text }]} numberOfLines={1}>{f.title}</Text>
            <Text style={[styles.small, { color: f.pace === 'slow' ? t.status.processing : t.textMuted }]}>
              Идёт {days(f.elapsedDays)} · обычно {days(f.typicalDays)}
              {f.expectedAt ? ` · ожидается к ${new Date(f.expectedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}` : ''}
            </Text>
            {f.pace === 'slow' && <Text style={[styles.tiny, { color: t.status.processing }]}>Дольше обычного: {f.reason}</Text>}
          </Pressable>
        ))}
      </Card>

      <Text style={[styles.section, { color: t.text }]}>Сколько ждут после этапа</Text>
      <Card style={{ gap: 10 }}>
        {stages.map(s => (
          <View key={s.stage} style={{ gap: 4 }}>
            <View style={styles.rowBetween}>
              <Text style={[styles.small, { color: t.text, flex: 1 }]} numberOfLines={1}>{s.stage}</Text>
              <Text style={[styles.small, { color: t.text }]}>{days(s.median)} <Text style={{ color: t.textMuted }}>· до {days(s.p80)}</Text></Text>
            </View>
            <Bar d={s} max={stageMax} />
          </View>
        ))}
      </Card>

      <Text style={[styles.section, { color: t.text }]}>Причины отказов</Text>
      <Card style={{ gap: 6 }}>
        {data.rejections.criteria.length === 0 && <Text style={[styles.small, { color: t.textMuted }]}>Нет данных</Text>}
        {data.rejections.criteria.slice(0, 8).map(c => (
          <View key={c.label} style={styles.rowBetween}>
            <Text style={[styles.small, { color: t.text, flex: 1 }]}>{c.label}</Text>
            <Text style={[styles.small, { color: t.textMuted }]}>{c.count}</Text>
          </View>
        ))}
        <Text style={[styles.tiny, { color: t.textMuted, marginTop: 4 }]}>
          Одобрено с первой подачи: {data.resubmissions.firstTimeApproved}, после повторной: {data.resubmissions.approvedAfterRetry}
          {data.resubmissions.avgAttemptsToApprove ? ` · в среднем ${String(data.resubmissions.avgAttemptsToApprove).replace('.', ',')} подачи` : ''}
        </Text>
      </Card>

      <Text style={[styles.section, { color: t.text }]}>Комиссии</Text>
      <Card style={{ gap: 8 }}>
        {orgs.map(o => (
          <View key={o.name} style={{ gap: 1 }}>
            <Text style={[styles.small, { color: t.text }]} numberOfLines={2}>{o.name}</Text>
            <Text style={[styles.tiny, { color: o.bad ? t.danger : t.textMuted }]}>
              отказы {pct(o.rejectRate)} ({o.bad} из {o.ok + o.bad + o.other}) · ответ {days(o.response?.median)}, до {days(o.response?.p80)}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, paddingBottom: 40 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { fontFamily: font.semibold, fontSize: 20 },
  section: { fontFamily: font.semibold, fontSize: 15, marginTop: 6 },
  label: { fontFamily: font.medium, fontSize: 14 },
  small: { fontFamily: font.regular, fontSize: 13 },
  tiny: { fontFamily: font.regular, fontSize: 11 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
});
