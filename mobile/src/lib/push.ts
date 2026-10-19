import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { api } from './api';

export const CHANNEL_ID = 'status-changes';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let lastToken: string | null = null;

/**
 * Asks for permission and sends this phone's native FCM token to the server,
 * which pushes status changes straight through Firebase (not Expo's service).
 * Safe to call on every launch — the server upserts the token.
 */
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  // Android 13+ shows the permission prompt only once a channel exists.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Изменения статусов',
    importance: Notifications.AndroidImportance.HIGH,
  });
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;

  const { data } = await Notifications.getDevicePushTokenAsync();
  const token = typeof data === 'string' ? data : null;
  if (token) {
    await api.registerPush(token);
    lastToken = token;
  }
  return token;
}

export async function unregisterPush(): Promise<void> {
  if (!lastToken) return;
  try {
    await api.unregisterPush(lastToken);
  } catch {
    // the server drops it anyway once the session is revoked
  }
  lastToken = null;
}
