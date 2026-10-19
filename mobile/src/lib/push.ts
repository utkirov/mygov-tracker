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

/** Push buttons from design A10. Pushes reference it with categoryId "application". */
export const NOTIFICATION_CATEGORY = 'application';
export const ACTION_OPEN = 'open';
export const ACTION_SCREENSHOT = 'screenshot';
export const ACTION_READ = 'read';

export async function registerNotificationActions(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY, [
    { identifier: ACTION_OPEN, buttonTitle: 'Открыть', options: { opensAppToForeground: true } },
    { identifier: ACTION_SCREENSHOT, buttonTitle: 'Скриншот', options: { opensAppToForeground: true } },
    { identifier: ACTION_READ, buttonTitle: 'Прочитано', options: { opensAppToForeground: false } },
  ]).catch(() => {});
}

/** This phone's FCM token (asks the OS again if the app was just started). */
export async function currentPushToken(): Promise<string | null> {
  if (lastToken) return lastToken;
  if (!Device.isDevice) return null;
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return null;
    const { data } = await Notifications.getDevicePushTokenAsync();
    lastToken = typeof data === 'string' ? data : null;
  } catch {
    lastToken = null;
  }
  return lastToken;
}

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
