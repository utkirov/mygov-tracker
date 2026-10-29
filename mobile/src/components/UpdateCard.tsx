import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { formatSize } from '@/lib/status';
import { font, useTheme } from '@/lib/theme';
import { downloadAndInstall, type AppRelease } from '@/lib/updates';

import { liveUpdate } from '../../modules/live-update';

// Live Update / Glyph Progress while the APK downloads.
const LIVE_ID = 7101;

/** Design A8 «Доступно обновление»: shown on top of the board. */
export function UpdateCard({ release, onDismiss }: { release: AppRelease; onDismiss: () => void }) {
  const t = useTheme();
  const [progress, setProgress] = useState<{ fraction: number; bytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notes = release.notes.split('\n').map(l => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);

  async function start() {
    setError(null);
    setProgress({ fraction: 0, bytes: 0 });
    try {
      let lastPercent = -1;
      await downloadAndInstall(release, (fraction, bytes) => {
        setProgress({ fraction, bytes });
        const percent = Math.round(fraction * 100);
        if (percent !== lastPercent) {
          lastPercent = percent;
          liveUpdate.show(LIVE_ID, `Обновление ${release.version}`, `${percent}% · ${formatSize(bytes)} из ${formatSize(release.size)}`, percent, 100);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось скачать обновление');
    } finally {
      liveUpdate.end(LIVE_ID);
      setProgress(null);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: t.text }]}>Доступна версия {release.version}</Text>
        {!progress && (
          <Pressable onPress={onDismiss} hitSlop={10}>
            <Text style={[styles.small, { color: t.textMuted }]}>Позже</Text>
          </Pressable>
        )}
      </View>
      <Text style={[styles.small, { color: t.textMuted }]}>Размер {formatSize(release.size)} · загрузка с вашего сервера</Text>
      {notes.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={[styles.label, { color: t.text }]}>Что нового</Text>
          {notes.map((line, i) => <Text key={i} style={[styles.text, { color: t.textSoft }]}>• {line}</Text>)}
        </View>
      )}
      {progress ? (
        <View style={{ gap: 6 }}>
          <View style={[styles.track, { backgroundColor: t.panel }]}>
            <View style={[styles.bar, { backgroundColor: t.accent, width: `${Math.round(progress.fraction * 100)}%` }]} />
          </View>
          <Text style={[styles.small, { color: t.textSoft }]}>
            Загрузка… {Math.round(progress.fraction * 100)}% · {formatSize(progress.bytes)} из {formatSize(release.size)}
          </Text>
        </View>
      ) : (
        <Button title="Установить обновление" onPress={() => void start()} />
      )}
      {error && <Text style={[styles.text, { color: t.danger }]}>{error}</Text>}
      <Text style={[styles.small, { color: t.textMuted }]}>
        Android попросит подтвердить установку. Изменения интерфейса приходят и без переустановки (по воздуху).
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: font.semibold, fontSize: 15 },
  label: { fontFamily: font.medium, fontSize: 13 },
  text: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
});
