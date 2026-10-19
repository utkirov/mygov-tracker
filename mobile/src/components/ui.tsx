import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { font, radius, useTheme } from '@/lib/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>;
}

export function StatusDot({ color, label }: { color: string; label: string }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color: t.text }]}>{label}</Text>
    </View>
  );
}

export function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'danger' }) {
  const t = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: t.panel }]}>
      <Text style={[styles.tagText, { color: tone === 'danger' ? t.danger : t.textSoft }]}>{children}</Text>
    </View>
  );
}

export function Button({ title, onPress, busy, variant = 'primary', disabled }: { title: string; onPress: () => void; busy?: boolean; variant?: 'primary' | 'secondary'; disabled?: boolean }) {
  const t = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: t.primary } : { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1 },
        (pressed || disabled) && { opacity: 0.7 },
      ]}
    >
      {busy
        ? <ActivityIndicator color={primary ? t.onPrimary : t.text} />
        : <Text style={[styles.buttonText, { color: primary ? t.onPrimary : t.text }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: t.textSoft }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.textMuted}
        {...props}
        style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
      />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: active ? t.primary : t.panel }]}>
      <Text style={[styles.chipText, { color: active ? t.onPrimary : t.textSoft }]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={[styles.empty, { color: t.textMuted }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: font.medium, fontSize: 13 },
  tag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontFamily: font.medium, fontSize: 11 },
  button: { height: 44, borderRadius: radius.inner, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontFamily: font.semibold, fontSize: 14 },
  label: { fontFamily: font.medium, fontSize: 12 },
  input: { height: 44, borderWidth: 1, borderRadius: radius.inner, paddingHorizontal: 12, fontFamily: font.regular, fontSize: 15 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontFamily: font.medium, fontSize: 13 },
  empty: { textAlign: 'center', fontFamily: font.regular, fontSize: 13, paddingVertical: 32 },
});

/** Design A9: shown above any screen that is displaying the saved offline copy. */
export function OfflineBanner({ since, onRetry }: { since: string; onRetry: () => void }) {
  const t = useTheme();
  const when = new Date(since).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <View style={[bannerStyles.banner, { backgroundColor: t.panel, borderColor: t.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[bannerStyles.bannerTitle, { color: t.text }]}>Сервер недоступен</Text>
        <Text style={[bannerStyles.bannerText, { color: t.textSoft }]}>
          Компьютер выключен или нет интернета. Данные на {when}.
        </Text>
      </View>
      <Pressable onPress={onRetry} hitSlop={8}>
        <Text style={[bannerStyles.bannerAction, { color: t.accent }]}>Повторить</Text>
      </Pressable>
    </View>
  );
}

export function Notice({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'danger' }) {
  const t = useTheme();
  return (
    <View style={[bannerStyles.banner, { backgroundColor: t.panel, borderColor: t.border }]}>
      {tone === 'danger' && <View style={[styles.dot, { backgroundColor: t.danger }]} />}
      <Text style={[bannerStyles.bannerText, { color: tone === 'danger' ? t.text : t.textSoft, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.inner, padding: 12 },
  bannerTitle: { fontFamily: font.semibold, fontSize: 13 },
  bannerText: { fontFamily: font.regular, fontSize: 12, lineHeight: 17 },
  bannerAction: { fontFamily: font.semibold, fontSize: 13 },
});
