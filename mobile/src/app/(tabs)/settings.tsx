import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { UpdateCard } from '@/components/UpdateCard';
import { api, API_BASE, type HealthInfo, type PushPrefs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  biometricAvailable,
  isBackgroundSyncOn,
  isBiometricLockOn,
  loadTheme,
  saveTheme,
  setBackgroundSync,
  setBiometricLock,
  type ThemeChoice,
} from '@/lib/preferences';
import { currentPushToken, registerForPush } from '@/lib/push';
import { isWaitingReminderOn, setWaitingReminder } from '@/lib/waiting-reminder';
import { formatDate, formatUntil } from '@/lib/status';
import { font, radius, useTheme } from '@/lib/theme';
import { fetchAvailableUpdate, type AppRelease } from '@/lib/updates';

const THEMES: Array<{ id: ThemeChoice; label: string }> = [
  { id: 'system', label: 'Как в системе' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
];

export default function SettingsScreen() {
  const t = useTheme();
  const { signOut } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [biometric, setBiometric] = useState(false);
  const [biometricOk, setBiometricOk] = useState(false);
  const [sync, setSync] = useState(false);
  const [waitingReminder, setWaitingReminderState] = useState(true);
  const [update, setUpdate] = useState<AppRelease | null>(null);
  const [checkedUpdate, setCheckedUpdate] = useState(false);

  const load = useCallback(async () => {
    const token = await currentPushToken();
    setPushToken(token);
    const [me, info, pushPrefs] = await Promise.all([
      api.me().catch(() => null),
      api.health().catch(() => null),
      token ? api.pushPrefs(token).catch(() => null) : null,
    ]);
    setUsername(me?.username ?? null);
    setHealth(info);
    setOnline(info?.ok === true);
    if (pushPrefs) setPrefs(pushPrefs.prefs);
    setTheme(await loadTheme());
    setBiometric(await isBiometricLockOn());
    setBiometricOk(await biometricAvailable());
    setSync(await isBackgroundSyncOn());
    setWaitingReminderState(await isWaitingReminderOn());
    setUpdate(await fetchAvailableUpdate());
    setCheckedUpdate(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function enablePush() {
    const token = await registerForPush().catch(() => null);
    if (!token) {
      Alert.alert('Уведомления выключены', 'Разрешите уведомления для my.gov tracker в настройках Android.');
      return;
    }
    await load();
  }

  async function changePrefs(next: PushPrefs) {
    if (!pushToken) return;
    const previous = prefs;
    setPrefs(next);
    try {
      setPrefs((await api.savePushPrefs(pushToken, next)).prefs);
    } catch (e) {
      setPrefs(previous);
      Alert.alert('Не сохранено', e instanceof Error ? e.message : 'Нет связи с сервером');
    }
  }

  async function toggleWaitingReminder(on: boolean) {
    setWaitingReminderState(on);
    const apps = await api.applications(false).then(r => r.data).catch(() => undefined);
    await setWaitingReminder(on, apps);
  }

  /** Nothing OS / Android freeze background apps — this page has «Батарея → Без ограничений». */
  function openAppSystemSettings() {
    void IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: `package:${Application.applicationId ?? 'uz.turonproject.tracker'}` })
      .catch(() => Alert.alert('Не удалось открыть', 'Откройте Настройки → Приложения → my.gov tracker вручную.'));
  }

  async function toggleBiometric(on: boolean) {
    if (await setBiometricLock(on)) setBiometric(on);
  }

  async function toggleSync(on: boolean) {
    try {
      await setBackgroundSync(on);
      setSync(on);
    } catch {
      Alert.alert('Не удалось', 'Android не разрешил фоновую задачу.');
    }
  }

  function confirmSignOut() {
    Alert.alert('Выйти?', 'Токен этого устройства будет отозван, уведомления перестанут приходить.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  const version = `${Application.nativeApplicationVersion ?? '—'} (${Application.nativeBuildVersion ?? '—'})`;
  const otaDate = Updates.createdAt && !Updates.isEmbeddedLaunch ? Updates.createdAt.toISOString() : null;
  const server = API_BASE.replace(/^https?:\/\//, '');

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Card style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: t.primary }]}>
          <Text style={[styles.avatarText, { color: t.onPrimary }]}>mg</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>{username ?? 'admin'}</Text>
          <Text style={[styles.small, { color: t.textMuted }]}>{server}</Text>
        </View>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: online ? t.status.done : online === false ? t.danger : t.textMuted }]} />
          <Text style={[styles.small, { color: t.textSoft }]}>{online ? 'онлайн' : online === false ? 'недоступен' : '…'}</Text>
        </View>
      </Card>

      <Section title="Уведомления">
        {!pushToken || !prefs ? (
          <View style={{ gap: 8, paddingVertical: 6 }}>
            <Text style={[styles.text, { color: t.textSoft }]}>Push на этом телефоне не включён.</Text>
            <Button title="Включить уведомления" variant="secondary" onPress={() => void enablePush()} />
          </View>
        ) : (
          <>
            <Toggle label="Изменения статуса" hint="Push сразу при изменении" value={prefs.status} onChange={v => void changePrefs({ ...prefs, status: v })} />
            <Toggle label="Ошибки проверки" hint="Если my.gov.uz не отвечает" value={prefs.errors} onChange={v => void changePrefs({ ...prefs, errors: v })} />
            <Toggle label="Завершение заявления" hint="С документами результата" value={prefs.completed} onChange={v => void changePrefs({ ...prefs, completed: v })} />
            <Toggle label="Итог каждого цикла" hint="Даже без изменений" value={prefs.cycle} onChange={v => void changePrefs({ ...prefs, cycle: v })} />
            <Toggle label="Напоминания" hint="Каждый день в 10:00, пока заявление ждёт вашего действия" value={prefs.reminders} onChange={v => void changePrefs({ ...prefs, reminders: v })} />
            <Toggle label="Утренняя сводка" hint="В 09:00: сколько ждёт, изменения и ошибки за сутки" value={prefs.digest} onChange={v => void changePrefs({ ...prefs, digest: v })} />
            <Toggle label="Безопасность" hint="Входы, привязка телефона, блокировки — даже в тихие часы" value={prefs.security} onChange={v => void changePrefs({ ...prefs, security: v })} />
            <Toggle label="Сбои сервера" hint="Не удалась резервная копия и т.п." value={prefs.system} onChange={v => void changePrefs({ ...prefs, system: v })} />
            <Toggle
              label="Тихие часы"
              hint={`${prefs.quiet.from}–${prefs.quiet.to}, только срочное`}
              value={prefs.quiet.enabled}
              onChange={v => void changePrefs({ ...prefs, quiet: { ...prefs.quiet, enabled: v } })}
            />
          </>
        )}
      </Section>

      <Section title="Проверка">
        <InfoRow
          label="Автопроверка на сервере"
          hint={health?.autoCheck?.enabled
            ? `Каждые ${health.autoCheck.intervalMinutes} минут · следующая ${formatUntil(health.scheduler?.nextCycleAt)}`
            : health ? 'Выключена на компьютере' : 'Сервер недоступен'}
        />
        <Toggle label="Синхронизация в фоне" hint="Обновлять список, пока приложение закрыто" value={sync} onChange={v => void toggleSync(v)} />
        <Toggle label="Постоянное напоминание" hint="«N ждут вашего действия» в шторке и на Glyph, пока есть такие заявления" value={waitingReminder} onChange={v => void toggleWaitingReminder(v)} />
        <Pressable onPress={openAppSystemSettings} style={[styles.item, { borderTopColor: t.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.label, { color: t.text }]}>Работа в фоне</Text>
            <Text style={[styles.small, { color: t.textMuted }]}>Батарея → «Без ограничений», чтобы Nothing OS не усыпляла приложение</Text>
          </View>
          <Text style={[styles.small, { color: t.accent }]}>Открыть</Text>
        </Pressable>
      </Section>

      {update && <UpdateCard release={update} onDismiss={() => setUpdate(null)} />}

      <Section title="Аналитика">
        <Pressable onPress={() => router.push('/analytics')}>
          <InfoRow label="Сроки и аналитика" hint="Прогноз по заявлениям, сроки этапов, отказы, комиссии"
            right={<Text style={[styles.small, { color: t.accent }]}>Открыть</Text>} />
        </Pressable>
      </Section>

      <Section title="Приложение">
        <InfoRow
          label={`Версия ${version}`}
          hint={otaDate ? `Обновлено по воздуху ${formatDate(otaDate)}` : 'Установлена из APK'}
          right={<Text style={[styles.small, { color: update ? t.accent : t.status.done }]}>{!checkedUpdate ? '…' : update ? `Есть ${update.version}` : 'Актуальна'}</Text>}
        />
        <View style={[styles.item, { borderTopColor: t.border }]}>
          <Text style={[styles.label, { color: t.text }]}>Тема</Text>
          <View style={[styles.segment, { backgroundColor: t.panel }]}>
            {THEMES.map(option => (
              <Pressable key={option.id} onPress={() => { setTheme(option.id); void saveTheme(option.id); }}
                style={[styles.segmentItem, theme === option.id && { backgroundColor: t.surface }]}>
                <Text style={[styles.small, { color: theme === option.id ? t.text : t.textMuted }]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Toggle
          label="Блокировка отпечатком"
          hint={biometricOk ? 'При открытии приложения' : 'На телефоне не настроен отпечаток или Face ID'}
          value={biometric}
          disabled={!biometricOk}
          onChange={v => void toggleBiometric(v)}
        />
      </Section>

      <Section title="Безопасность">
        <InfoRow label="Это устройство" hint={Device.modelName ?? 'Android'} />
        <View style={{ paddingTop: 8, gap: 6 }}>
          <Button title="Выйти" variant="secondary" onPress={confirmSignOut} />
          <Text style={[styles.small, { color: t.textMuted, textAlign: 'center' }]}>Токен устройства будет отозван</Text>
        </View>
      </Section>
    </ScrollView>
  );

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>{title}</Text>
        <Card style={{ paddingVertical: 4 }}>{children}</Card>
      </View>
    );
  }

  function Toggle({ label, hint, value, onChange, disabled }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
      <View style={[styles.item, { borderTopColor: t.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.label, { color: disabled ? t.textMuted : t.text }]}>{label}</Text>
          <Text style={[styles.small, { color: t.textMuted }]}>{hint}</Text>
        </View>
        <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: t.accent, false: t.border }} thumbColor="#fff" />
      </View>
    );
  }

  function InfoRow({ label, hint, right }: { label: string; hint: string; right?: React.ReactNode }) {
    return (
      <View style={[styles.item, { borderTopColor: t.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.label, { color: t.text }]}>{label}</Text>
          <Text style={[styles.small, { color: t.textMuted }]}>{hint}</Text>
        </View>
        {right}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.semibold, fontSize: 14 },
  title: { fontFamily: font.semibold, fontSize: 15 },
  sectionTitle: { fontFamily: font.medium, fontSize: 12, paddingHorizontal: 4 },
  label: { fontFamily: font.medium, fontSize: 14 },
  text: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  segment: { flexDirection: 'row', borderRadius: radius.inner, padding: 2 },
  segmentItem: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
});
