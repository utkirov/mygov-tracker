import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Button, Card, Empty, OfflineBanner, StatusDot, Tag } from '@/components/ui';
import {
  api,
  applicationPdfUrl,
  artifactUrl,
  authHeaders,
  downloadAndOpen,
  UnauthorizedError,
  type Application,
  type ApplicationArtifacts,
  type StatusHistoryEntry,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CHANGE_FIELD_LABELS, formatAgo, formatDate, formatSize, formatUntil, statusInfo, statusType } from '@/lib/status';
import { font, radius, useTheme } from '@/lib/theme';

const NO_ARTIFACTS: ApplicationArtifacts = { screenshot: null, status_pdf: null, results: [] };

export default function ApplicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { expire } = useAuth();
  const [app, setApp] = useState<Application | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [artifacts, setArtifacts] = useState<ApplicationArtifacts>(NO_ARTIFACTS);
  const [chain, setChain] = useState<Application[]>([]);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [nextCycleAt, setNextCycleAt] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [main, files, related, h] = await Promise.all([
        api.application(id),
        api.artifacts(id).catch(() => null),
        api.chain(id).catch(() => null),
        authHeaders(),
      ]);
      setApp(main.data.application);
      setHistory(main.data.history);
      setNotes(main.data.application.notes ?? '');
      setOfflineSince(main.offlineSince);
      if (files) setArtifacts(files.data);
      if (related) setChain(related.data);
      setHeaders(h);
      setError(null);
      if (!main.offlineSince) api.health().then(info => setNextCycleAt(info.scheduler?.nextCycleAt ?? null)).catch(() => {});
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

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await api.saveNotes(id, notes);
      Alert.alert('Заметка сохранена');
    } catch (e) {
      Alert.alert('Не сохранено', e instanceof Error ? e.message : 'Повторите попытку');
    } finally {
      setSavingNotes(false);
    }
  }

  async function open(key: string, url: string, name: string, mime: string) {
    setBusyFile(key);
    try {
      await downloadAndOpen(url, name, mime);
    } catch (e) {
      Alert.alert('Не удалось открыть', e instanceof Error ? e.message : 'Повторите попытку');
    } finally {
      setBusyFile(null);
    }
  }

  async function fetchResults() {
    setBusyFile('results');
    try {
      setArtifacts(await api.fetchResultDocuments(id));
    } catch (e) {
      Alert.alert('Документы не получены', e instanceof Error ? e.message : 'Повторите попытку');
    } finally {
      setBusyFile(null);
    }
  }

  if (!app) return <Empty text={error ?? 'Загрузка…'} />;
  const s = statusInfo(app.status, t);
  const completed = statusType(app) === 'completed' || app.archived;
  const n = app.application_number;
  const shot = artifacts.screenshot;

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {offlineSince && <OfflineBanner since={offlineSince} onRetry={() => void load()} />}

      <Card style={{ gap: 10 }}>
        <Text style={[styles.number, { color: t.textMuted }]}>№ {n}</Text>
        <Text style={[styles.title, { color: t.text }]}>{app.object_name || app.service_name}</Text>
        {!!app.object_name && <Text style={[styles.text, { color: t.textSoft }]}>{app.service_name}</Text>}
        {!!app.organization && <Text style={[styles.text, { color: t.textMuted }]}>{app.organization}</Text>}
        <View style={styles.tags}>
          <StatusDot color={s.color} label={s.label} />
          {app.parent_id && <Tag>Цепочка</Tag>}
        </View>
        {app.last_change_summary.length > 0 && (
          <View style={[styles.change, { backgroundColor: t.panel }]}>
            <Text style={[styles.text, { color: t.text }]}>
              {formatAgo(app.last_detected_change_at)}: {app.last_change_summary.join(' · ')}
            </Text>
          </View>
        )}
        {app.sync_state === 'error' && !!app.last_error && <Text style={[styles.text, { color: t.danger }]}>{app.last_error}</Text>}
        {error && <Text style={[styles.text, { color: t.danger }]}>{error}</Text>}
        {!completed && <Button title="Проверить сейчас" onPress={check} busy={checking} disabled={!!offlineSince} />}
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={styles.sectionHead}>
          <Text style={[styles.section, { color: t.text }]}>Скриншот my.gov</Text>
          {shot && <Text style={[styles.mono, { color: t.textMuted }]}>{formatDate(shot.saved_at)}</Text>}
        </View>
        {shot && !offlineSince ? (
          <Pressable onPress={() => void open('shot', artifactUrl(id, 'screenshot.png', shot.saved_at), `screenshot-${n}.png`, 'image/png')}>
            <Image
              source={{ uri: artifactUrl(id, 'screenshot.png', shot.saved_at), headers }}
              style={[styles.shot, { borderColor: t.border }]}
              resizeMode="cover"
            />
          </Pressable>
        ) : (
          <Text style={[styles.text, { color: t.textMuted }]}>
            {shot ? 'Скриншот откроется, когда сервер снова будет доступен.' : 'Появится после следующей проверки.'}
          </Text>
        )}
      </Card>

      <Card style={{ gap: 2 }}>
        <Text style={[styles.section, { color: t.text, marginBottom: 6 }]}>Состояние</Text>
        <Row label="Состояние" value={s.label} />
        <Row label="Текущее действие" value={app.current_action || '—'} />
        <Row label="Действует" value={app.acting_party || '—'} />
        <Row label="Изменено" value={formatDate(app.last_changed_date)} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={[styles.section, { color: t.text }]}>История</Text>
        {history.length === 0 && <Text style={[styles.text, { color: t.textMuted }]}>Пока без изменений</Text>}
        {history.map(h => {
          const hs = statusInfo(h.status, t);
          return (
            <View key={h.id} style={[styles.historyRow, { borderTopColor: t.border }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <StatusDot color={hs.color} label={hs.label} />
                {!!h.current_action && <Text style={[styles.small, { color: t.textSoft }]}>{h.current_action}{h.acting_party ? ` · ${h.acting_party}` : ''}</Text>}
              </View>
              <Text style={[styles.mono, { color: t.textMuted }]}>{formatDate(h.recorded_at)}</Text>
            </View>
          );
        })}
      </Card>

      <Card style={{ gap: 2 }}>
        <Text style={[styles.section, { color: t.text, marginBottom: 6 }]}>Данные</Text>
        <Row
          label="Пароль проверки"
          value={app.verification_password ? (showPassword ? app.verification_password : '••••••') : '—'}
          onPress={app.verification_password ? () => setShowPassword(v => !v) : undefined}
          icon={app.verification_password ? (showPassword ? 'eyeOff' : 'eye') : undefined}
        />
        <Row label="SMS-телефон" value={app.sms_phone || '—'} />
        <Row label="Дата подачи" value={app.submission_date ? new Date(app.submission_date).toLocaleDateString('ru-RU') : '—'} />
        <Row label="Последняя проверка" value={formatAgo(app.last_checked_at)} />
        {!completed && <Row label="Следующая" value={formatUntil(nextCycleAt ?? app.next_check_at)} accent />}
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={[styles.section, { color: t.text }]}>Документы</Text>
        {!!app.pdf_filename && (
          <DocRow title={app.pdf_filename} subtitle="PDF заявления" busy={busyFile === 'pdf'}
            onPress={() => void open('pdf', applicationPdfUrl(id), app.pdf_filename, 'application/pdf')} />
        )}
        {artifacts.status_pdf && (
          <DocRow title="Статус my.gov.pdf" subtitle={`снимок статуса · ${formatSize(artifacts.status_pdf.size)}`} busy={busyFile === 'status'}
            onPress={() => void open('status', artifactUrl(id, 'status.pdf'), `status-${n}.pdf`, 'application/pdf')} />
        )}
        {artifacts.results.map(doc => (
          <DocRow key={doc.file} title={doc.title || 'Документ результата'} subtitle={[doc.pin && `PIN ${doc.pin}`, formatSize(doc.size)].filter(Boolean).join(' · ')}
            busy={busyFile === doc.file}
            onPress={() => void open(doc.file, artifactUrl(id, doc.file), `${doc.title || 'document'}-${n}.pdf`, 'application/pdf')} />
        ))}
        {artifacts.results.length === 0 && (completed ? (
          <Button title="Получить документы результата" variant="secondary" busy={busyFile === 'results'} onPress={fetchResults} disabled={!!offlineSince} />
        ) : (
          <Text style={[styles.small, { color: t.textMuted }]}>Документы результата появятся автоматически, когда заявление будет завершено.</Text>
        ))}
      </Card>

      {chain.length > 1 && (
        <Card style={{ gap: 8 }}>
          <Text style={[styles.section, { color: t.text }]}>Цепочка</Text>
          {chain.map(item => {
            const cs = statusInfo(item.status, t);
            const current = item.id === id;
            return (
              <Pressable key={item.id} disabled={current}
                onPress={() => router.push({ pathname: '/application/[id]', params: { id: item.id } })}
                style={[styles.chainRow, { backgroundColor: current ? t.panel : 'transparent', borderColor: t.border }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.mono, { color: t.textMuted }]}>№ {item.application_number}</Text>
                  <Text style={[styles.value, { color: t.text }]} numberOfLines={1}>{item.service_name || item.object_name}</Text>
                </View>
                <StatusDot color={cs.color} label={cs.label} />
              </Pressable>
            );
          })}
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <Text style={[styles.section, { color: t.text }]}>Заметки</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Договорённости, замечания, кому позвонить…"
          placeholderTextColor={t.textMuted}
          style={[styles.notes, { color: t.text, backgroundColor: t.panel, borderColor: t.border }]}
          editable={!offlineSince}
        />
        <Button title="Сохранить" variant="secondary" onPress={saveNotes} busy={savingNotes} disabled={!!offlineSince || notes === (app.notes ?? '')} />
      </Card>

      {app.last_change_fields.length > 0 && (
        <View style={styles.tags}>{app.last_change_fields.map(f => <Tag key={f}>{CHANGE_FIELD_LABELS[f] ?? f}</Tag>)}</View>
      )}
    </ScrollView>
  );

  function Row({ label, value, onPress, icon, accent }: { label: string; value: string; onPress?: () => void; icon?: 'eye' | 'eyeOff'; accent?: boolean }) {
    return (
      <Pressable onPress={onPress} disabled={!onPress} style={[styles.row, { borderTopColor: t.border }]}>
        <Text style={[styles.text, { color: t.textMuted }]}>{label}</Text>
        <View style={styles.rowValue}>
          <Text style={[styles.value, { color: accent ? t.accent : t.text }]}>{value}</Text>
          {icon && <Icon name={icon} size={15} color={t.textMuted} />}
        </View>
      </Pressable>
    );
  }

  function DocRow({ title, subtitle, onPress, busy }: { title: string; subtitle: string; onPress: () => void; busy?: boolean }) {
    return (
      <Pressable onPress={onPress} disabled={busy || !!offlineSince} style={[styles.docRow, { backgroundColor: t.panel }]}>
        <Icon name="file" size={18} color={t.textMuted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.value, { color: t.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.small, { color: t.textMuted }]} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Text style={[styles.small, { color: t.accent }]}>{busy ? '…' : 'Открыть'}</Text>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  number: { fontFamily: font.mono, fontSize: 12 },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26 },
  text: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  value: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: font.mono, fontSize: 12 },
  section: { fontFamily: font.semibold, fontSize: 14 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  change: { borderRadius: radius.inner, padding: 10 },
  shot: { width: '100%', height: 260, borderRadius: radius.inner, borderWidth: 1, backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, borderTopWidth: 1, paddingTop: 8 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.inner, padding: 12 },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.inner, borderWidth: 1, padding: 10 },
  notes: { minHeight: 90, borderWidth: 1, borderRadius: radius.inner, padding: 12, fontFamily: font.regular, fontSize: 14, textAlignVertical: 'top' },
});
