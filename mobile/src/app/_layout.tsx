import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { font, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function openFromNotification(response: Notifications.NotificationResponse | null | undefined) {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const id = response.notification.request.content.data?.applicationId;
  if (typeof id === 'string' && id) router.push({ pathname: '/application/[id]', params: { id } });
}

function Gate() {
  const { ready, signedIn } = useAuth();
  const segments = useSegments();
  const theme = useTheme();
  const scheme = useColorScheme();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === 'login' || segments[0] === 'pair';
    if (!signedIn && !onLogin) router.replace('/login');
    else if (signedIn && onLogin) router.replace('/');
  }, [ready, signedIn, segments]);

  useEffect(() => {
    if (!ready || !signedIn) return;
    openFromNotification(lastResponse);
    if (lastResponse) Notifications.clearLastNotificationResponse();
  }, [ready, signedIn, lastResponse]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
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
      </Stack>
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
