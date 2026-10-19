import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Button } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
// Also registers the background sync task — must load at startup.
import { applyTheme, isBiometricLockOn, loadTheme, unlockWithBiometrics } from '@/lib/preferences';
import { ACTION_READ, ACTION_SCREENSHOT, registerNotificationActions } from '@/lib/push';
import { font, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
void loadTheme().then(applyTheme);
void registerNotificationActions();

// Re-lock after the app has been in the background this long.
const RELOCK_AFTER_MS = 60_000;

function handleNotificationResponse(response: Notifications.NotificationResponse | null | undefined) {
  if (!response) return;
  const request = response.notification.request;
  if (response.actionIdentifier === ACTION_READ) {
    void Notifications.dismissNotificationAsync(request.identifier);
    return;
  }
  const id = request.content.data?.applicationId;
  if (typeof id !== 'string' || !id) return;
  router.push({
    pathname: '/application/[id]',
    params: response.actionIdentifier === ACTION_SCREENSHOT ? { id, open: 'screenshot' } : { id },
  });
}

/** Design A7 «Блокировка отпечатком»: covers the app until the fingerprint is accepted. */
function useBiometricGate(signedIn: boolean) {
  const [locked, setLocked] = useState(false);
  const backgroundSince = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (await unlockWithBiometrics()) setLocked(false);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void isBiometricLockOn().then(on => {
      if (on) { setLocked(true); void unlock(); }
    });
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') backgroundSince.current = Date.now();
      if (state === 'active' && backgroundSince.current && Date.now() - backgroundSince.current > RELOCK_AFTER_MS) {
        backgroundSince.current = null;
        void isBiometricLockOn().then(on => {
          if (on) { setLocked(true); void unlock(); }
        });
      }
    });
    return () => sub.remove();
  }, [signedIn, unlock]);

  return { locked: signedIn && locked, unlock };
}

function Gate() {
  const { ready, signedIn } = useAuth();
  const segments = useSegments();
  const theme = useTheme();
  const scheme = useColorScheme();
  const lastResponse = Notifications.useLastNotificationResponse();
  const { locked, unlock } = useBiometricGate(ready && signedIn);

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === 'login' || segments[0] === 'pair';
    if (!signedIn && !onLogin) router.replace('/login');
    else if (signedIn && onLogin) router.replace('/');
  }, [ready, signedIn, segments]);

  useEffect(() => {
    if (!ready || !signedIn) return;
    handleNotificationResponse(lastResponse);
    if (lastResponse) Notifications.clearLastNotificationResponse();
  }, [ready, signedIn, lastResponse]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: font.semibold, fontSize: 16 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="pair" options={{ title: 'Вход по QR' }} />
        <Stack.Screen name="application/[id]" options={{ title: 'Заявка' }} />
        <Stack.Screen name="add" options={{ title: 'Новое заявление' }} />
      </Stack>
      {locked && (
        <View style={[StyleSheet.absoluteFill, styles.lock, { backgroundColor: theme.bg }]}>
          <Text style={[styles.lockTitle, { color: theme.text }]}>my.gov tracker заблокирован</Text>
          <Button title="Разблокировать" onPress={() => void unlock()} />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  lock: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  lockTitle: { fontFamily: font.semibold, fontSize: 16 },
});
