import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Button, Card, Field } from '@/components/ui';
import { api, createApplication, parsePdf, type ParsedPdf } from '@/lib/api';
import { font, radius, useTheme } from '@/lib/theme';

import { liveUpdate } from '../../modules/live-update';

const LIVE_ADD_ID = 7103;

const RECOGNISED: Array<keyof ParsedPdf> = [
  'application_number', 'verification_password', 'service_name', 'organization',
  'status', 'submission_date', 'current_action', 'sms_phone',
];

/** Design A4 «Новое заявление»: PDF from the phone → check the data → add and check. */
export default function AddScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ file?: string }>();
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null);
  const [parsed, setParsed] = useState<ParsedPdf | null>(null);
  const [filename, setFilename] = useState('');
  const [storageKey, setStorageKey] = useState('');
  const [objectName, setObjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const handledShared = useRef(false);

  const upload = useCallback(async (file: { uri: string; name: string }) => {
    setBusy('upload');
    setError(null);
    try {
      const result = await parsePdf(file);
      setParsed(result.fields);
      setFilename(result.filename);
      setStorageKey(result.pdfStorageKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать PDF');
    } finally {
      setBusy(null);
    }
  }, []);

  // Opened via «Открыть с помощью» (see +native-intent.tsx).
  useEffect(() => {
    if (handledShared.current || typeof params.file !== 'string' || !params.file) return;
    handledShared.current = true;
    const uri = decodeURIComponent(params.file);
    void upload({ uri, name: decodeURIComponent(uri.split('/').pop() ?? 'zayavlenie.pdf') });
  }, [params.file, upload]);

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await upload({ uri: asset.uri, name: asset.name || 'zayavlenie.pdf' });
  }

  function set(key: keyof ParsedPdf, value: string) {
    setParsed(prev => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!parsed) return;
    if (!parsed.application_number.trim() || !parsed.verification_password.trim()) {
      setError('Нужны номер заявления и пароль проверки');
      return;
    }
    setBusy('save');
    setError(null);
    try {
      const id = await createApplication({ ...parsed, object_name: objectName.trim(), pdf_filename: filename, pdf_storage_key: storageKey });
      liveUpdate.show(LIVE_ADD_ID, `Первая проверка № ${parsed.application_number}`, 'Запрос к my.gov.uz…', 0, 100, true);
      await api.check(id).catch(() => null).finally(() => liveUpdate.end(LIVE_ADD_ID));
      router.replace({ pathname: '/application/[id]', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
      setBusy(null);
    }
  }

  const recognised = parsed ? RECOGNISED.filter(k => parsed[k]?.trim()).length : 0;

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 12 }}>
        <Text style={[styles.section, { color: t.text }]}>PDF из my.gov.uz</Text>
        {busy === 'upload' ? (
          <View style={styles.center}><ActivityIndicator color={t.text} /><Text style={[styles.small, { color: t.textMuted }]}>Распознаю PDF…</Text></View>
        ) : parsed ? (
          <View style={[styles.file, { backgroundColor: t.panel }]}>
            <Icon name="file" size={18} color={t.status.done} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.value, { color: t.text }]} numberOfLines={1}>{filename}</Text>
              <Text style={[styles.small, { color: t.status.done }]}>Распознано {recognised} полей из {RECOGNISED.length}</Text>
            </View>
          </View>
        ) : null}
        <Button title={parsed ? 'Выбрать другой файл' : 'Выбрать файл'} variant={parsed ? 'secondary' : 'primary'} onPress={() => void pick()} disabled={busy !== null} />
        <Text style={[styles.small, { color: t.textMuted }]}>
          PDF из «Загрузок» — или откройте PDF в Telegram/почте через «Открыть с помощью → my.gov tracker».
        </Text>
      </Card>

      {parsed && (
        <Card style={{ gap: 12 }}>
          <Text style={[styles.section, { color: t.text }]}>Проверьте данные</Text>
          <Field label="Номер заявления" value={parsed.application_number} onChangeText={v => set('application_number', v)} keyboardType="number-pad" />
          <Field label="Пароль проверки" value={parsed.verification_password} onChangeText={v => set('verification_password', v)} autoCapitalize="none" />
          <Field label="Объект" value={objectName} onChangeText={setObjectName} placeholder="Жилой дом, участок, помещение" />
          <Field label="Услуга" value={parsed.service_name} onChangeText={v => set('service_name', v)} />
          <Field label="Организация" value={parsed.organization} onChangeText={v => set('organization', v)} />
          <Field label="SMS-телефон" value={parsed.sms_phone} onChangeText={v => set('sms_phone', v)} keyboardType="phone-pad" />
          {error && <Text style={[styles.small, { color: t.danger }]}>{error}</Text>}
          <Button title={busy === 'save' ? 'Добавляю и проверяю…' : 'Добавить и проверить'} onPress={() => void save()} busy={busy === 'save'} />
        </Card>
      )}
      {!parsed && error && <Text style={[styles.small, { color: t.danger, textAlign: 'center' }]}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  section: { fontFamily: font.semibold, fontSize: 15 },
  value: { fontFamily: font.medium, fontSize: 13 },
  small: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.inner, padding: 12 },
});
