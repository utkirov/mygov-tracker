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
 * Android fixes a channel's vibration when it is created, so each vibration
 * pattern gets its own channel; the server picks one per push (lib/push.ts on
 * the website). Patterns: [wait, buzz, pause, buzz…] in ms.
 */
export const CHANNELS = {
  urgent: 'status-urgent',
  alerts: 'status-alerts',
  quiet: 'cycle-summary',
} as const;

export async function ensureNotificationChannels(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(CHANNELS.urgent, {
      name: 'Нужно ваше действие и завершение',
      description: 'Заявление ждёт заявителя или пришёл итоговый результат',
      importance: Notifications.AndroidImportance.MAX,
      enableVibrate: true,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lightColor: '#2563EB',
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.alerts, {
      name: 'Изменения статусов и ошибки',
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#2563EB',
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.quiet, {
      name: 'Итог цикла проверки',
      importance: Notifications.AndroidImportance.LOW,
      enableVibrate: false,
      sound: null,
    });
  } catch {
    // Older OS / no notification service — pushes fall back to the default channel.
  }
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
  await ensureNotificationChannels();
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
