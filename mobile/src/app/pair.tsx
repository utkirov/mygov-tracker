import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { font, radius, useTheme } from '@/lib/theme';

/** The QR on the website encodes `mygovtracker://pair?code=…`. */
function codeFromQr(data: string): string | null {
  const match = data.match(/^mygovtracker:\/\/pair\?(?:.*&)?code=([\w-]+)/);
  return match ? match[1] : null;
}

/**
 * «Вход по QR» (design A1). Opened from the login screen (camera scanner) or
 * directly by the deep link when the QR was scanned with the system camera.
 */
export default function PairScreen() {
  const t = useTheme();
  const { signInWithCode } = useAuth();
  const params = useLocalSearchParams<{ code?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const claim = useCallback(async (code: string) => {
    if (handled.current) return;
    handled.current = true;
    setBusy(true);
    setError(null);
    try {
      await signInWithCode(code);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось привязать телефон');
      handled.current = false;
    } finally {
      setBusy(false);
    }
  }, [signInWithCode]);

  useEffect(() => {
    if (typeof params.code === 'string' && params.code) void claim(params.code);
  }, [params.code, claim]);

  const fromLink = typeof params.code === 'string' && !!params.code;

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <Card style={{ gap: 12 }}>
        <Text style={[styles.title, { color: t.text }]}>Привязка по QR</Text>
        <Text style={[styles.text, { color: t.textSoft }]}>
          На компьютере откройте трекер → Настройки → «Приложение Android» → «Показать QR» и наведите камеру.
        </Text>

        {busy ? (
          <View style={styles.center}><ActivityIndicator color={t.text} /></View>
        ) : fromLink && !error ? null : !permission ? null : !permission.granted ? (
          <Button title="Разрешить камеру" onPress={() => void requestPermission()} />
        ) : (
          <View style={[styles.cameraBox, { borderColor: t.border }]}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={busy ? undefined : ({ data }) => {
                const code = codeFromQr(data);
                if (code) void claim(code);
                else setError('Это не QR привязки трекера');
              }}
            />
          </View>
        )}

        {error && <Text style={[styles.text, { color: t.danger }]}>{error}</Text>}
        <Text style={[styles.hint, { color: t.textMuted }]}>
          Пароль не хранится на телефоне — только токен устройства в защищённом хранилище Android.
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  title: { fontFamily: font.semibold, fontSize: 18 },
  text: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  hint: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  center: { paddingVertical: 32, alignItems: 'center' },
  cameraBox: { height: 300, borderRadius: radius.card, borderWidth: 1, overflow: 'hidden' },
});
