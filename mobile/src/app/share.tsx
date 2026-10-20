import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Chip, Field } from '@/components/ui';
import { api, type ShareLinkInfo, type ShareTarget } from '@/lib/api';
import { formatDate } from '@/lib/status';
import { font, useTheme } from '@/lib/theme';

const DURATIONS: Array<{ minutes: number | null; label: string }> = [
  { minutes: 30, label: '30 мин' },
  { minutes: 60, label: '1 час' },
  { minutes: 24 * 60, label: '1 день' },
  { minutes: 7 * 24 * 60, label: '7 дней' },
  { minutes: 30 * 24 * 60, label: '30 дней' },
  { minutes: null, label: 'Бессрочно' },
];

/**
 * «Ссылка для клиента» — /share?app=<id>&title=… or /share?client=<id>&title=…
 * Same options as the website: lifetime, PIN, result documents; active links with views and «Отозвать».
 */
export default function ShareScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ app?: string; client?: string; title?: string }>();
  const target: ShareTarget | null = params.client ? { client: params.client } : params.app ? { app: params.app } : null;
  const isClient = !!params.client;
  const [minutes, setMinutes] = useState<number | null>(isClient ? 30 * 24 * 60 : 24 * 60);
  const [pin, setPin] = useState('');
  const [label, setLabel] = useState(params.title ?? '');
  const [docs, setDocs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<ShareLinkInfo[]>([]);
  const [views, setViews] = useState<Record<string, Array<{ viewed_at: string; device: string }>>>({});

  const key = target ? JSON.stringify(target) : '';
  const load = useCallback(async () => {
    if (!key) return;
    try {
      setLinks((await api.shareLinks(JSON.parse(key) as ShareTarget)).links);
    } catch { /* offline — list stays empty */ }
  }, [key]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!target) return;
    if (pin && !/^\d{4,8}$/.test(pin)) { Alert.alert('PIN — от 4 до 8 цифр'); return; }
    setBusy(true);
    try {
      const { link } = await api.createLink(target, { minutes, pin, label, showDocuments: docs });
      const until = link.expires_at ? `Ссылка действует до ${formatDate(link.expires_at)}` : '';
      const head = isClient ? `Ваши заявления (${params.title ?? 'my.gov'}):` : `Статус заявления «${params.title ?? ''}»:`;
      await Share.share({ message: [head, link.url, pin ? `PIN: ${pin}` : '', until].filter(Boolean).join('\n') });
      setPin('');
      await load();
    } catch (e) {
      Alert.alert('Ссылка не создана', e instanceof Error ? e.message : 'Повторите попытку');
    } finally {
      setBusy(false);
    }
  }

  function revoke(link: ShareLinkInfo) {
    Alert.alert('Отозвать ссылку?', 'Она сразу перестанет открываться, подписка в Telegram прекратится.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отозвать', style: 'destructive', onPress: async () => { await api.revokeLink(link.token).catch(() => {}); await load(); } },
    ]);
  }

  async function toggleViews(token: string) {
    if (views[token]) { setViews(({ [token]: _, ...rest }) => rest); return; }
    const list = (await api.linkViews(token).catch(() => ({ views: [] }))).views;
    setViews(v => ({ ...v, [token]: list }));
  }

  const active = links.filter(l => l.active);
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isClient ? 'Ссылка на все заявления' : 'Ссылка для клиента' }} />
      <Text style={[styles.small, { color: t.textMuted }]}>
        Статус, этапы и согласования без входа{isClient ? '; новые заявления клиента появятся сами' : ''}. Пароль, телефоны и заметки клиент не увидит, может подписаться в Telegram.
      </Text>

      <Card style={{ gap: 12 }}>
        <Text style={[styles.label, { color: t.text }]}>Срок действия</Text>
        <View style={styles.chips}>
          {DURATIONS.map(d => <Chip key={d.label} label={d.label} active={minutes === d.minutes} onPress={() => setMinutes(d.minutes)} />)}
        </View>
        <Field label="Для кого (необязательно)" value={label} onChangeText={setLabel} />
        <Field label="PIN (необязательно, 4–8 цифр)" value={pin} onChangeText={v => setPin(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" />
        <View style={styles.row}>
          <Text style={[styles.small, { color: t.text, flex: 1 }]}>Показывать документы результата</Text>
          <Switch value={docs} onValueChange={setDocs} />
        </View>
        <Button title="Создать и отправить" onPress={() => void create()} busy={busy} />
      </Card>

      {active.length > 0 && <Text style={[styles.section, { color: t.text }]}>Действующие ссылки</Text>}
      {active.map(l => (
        <Card key={l.token} style={{ gap: 6 }}>
          <Text style={[styles.label, { color: t.text }]}>{l.label || 'Ссылка'}{l.has_pin ? ' · с PIN' : ''}</Text>
          <Text style={[styles.tiny, { color: t.textMuted }]}>
            {l.expires_at ? `до ${formatDate(l.expires_at)}` : 'бессрочно'} · просмотров: {l.views}
            {l.subscribers ? ` · в Telegram: ${l.subscribers}` : ''}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => void Share.share({ message: l.url })}><Text style={[styles.small, { color: t.accent }]}>Отправить</Text></Pressable>
            <Pressable onPress={() => void toggleViews(l.token)}><Text style={[styles.small, { color: t.accent }]}>{views[l.token] ? 'Скрыть просмотры' : 'Просмотры'}</Text></Pressable>
            <Pressable onPress={() => revoke(l)}><Text style={[styles.small, { color: t.danger }]}>Отозвать</Text></Pressable>
          </View>
          {views[l.token]?.map((v, i) => (
            <Text key={i} style={[styles.tiny, { color: t.textSoft }]}>{formatDate(v.viewed_at)} · {v.device}</Text>
          ))}
          {views[l.token]?.length === 0 && <Text style={[styles.tiny, { color: t.textMuted }]}>Ещё не открывали</Text>}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, paddingBottom: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 2 },
  section: { fontFamily: font.semibold, fontSize: 15, marginTop: 4 },
  label: { fontFamily: font.medium, fontSize: 14 },
  small: { fontFamily: font.regular, fontSize: 13 },
  tiny: { fontFamily: font.regular, fontSize: 11 },
});
