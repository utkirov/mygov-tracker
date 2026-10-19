import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { font, useTheme } from '@/lib/theme';

export default function LoginScreen() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView behavior="height" style={styles.center}>
        <View style={styles.brand}>
          <View style={[styles.logo, { backgroundColor: t.primary }]}>
            <Text style={[styles.logoText, { color: t.onPrimary }]}>mg</Text>
          </View>
          <Text style={[styles.brandText, { color: t.text }]}>my.gov tracker</Text>
        </View>
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <Text style={[styles.title, { color: t.text }]}>Вход</Text>
            <Text style={[styles.subtitle, { color: t.textSoft }]}>Этот телефон останется в системе на год. Отозвать доступ можно в настройках сайта.</Text>
          </View>
          <Field label="Логин" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />
          {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
          <Button title="Войти" onPress={submit} busy={busy} disabled={!password} />
        </Card>
        <Text style={[styles.hint, { color: t.textMuted }]}>После 5 неверных попыток вход блокируется на 15 минут.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: 16, gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: font.semibold, fontSize: 12 },
  brandText: { fontFamily: font.semibold, fontSize: 15 },
  title: { fontFamily: font.semibold, fontSize: 20 },
  subtitle: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  error: { fontFamily: font.medium, fontSize: 13 },
  hint: { fontFamily: font.regular, fontSize: 12, textAlign: 'center' },
});
