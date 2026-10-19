import * as BackgroundTask from 'expo-background-task';
import * as LocalAuthentication from 'expo-local-authentication';
import * as TaskManager from 'expo-task-manager';
import { Appearance } from 'react-native';

import { api } from '@/lib/api';
import { readValue, writeValue } from '@/lib/cache';

/** App-only settings from design A7 (stored on the phone, not on the server). */

export type ThemeChoice = 'system' | 'light' | 'dark';

export async function loadTheme(): Promise<ThemeChoice> {
  const saved = await readValue('theme');
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

/** Appearance.setColorScheme overrides useColorScheme() everywhere, so useTheme() follows. */
export function applyTheme(choice: ThemeChoice): void {
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

export async function saveTheme(choice: ThemeChoice): Promise<void> {
  applyTheme(choice);
  await writeValue('theme', choice);
}

// ── Fingerprint lock ───────────────────────────────────────────────────────

export async function isBiometricLockOn(): Promise<boolean> {
  return (await readValue('biometric_lock')) === '1';
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function setBiometricLock(on: boolean): Promise<boolean> {
  if (on) {
    // Confirm once so the user can't lock themselves out with a sensor that doesn't work.
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Включить вход по отпечатку' });
    if (!result.success) return false;
  }
  await writeValue('biometric_lock', on ? '1' : '0');
  return true;
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Разблокируйте my.gov tracker', fallbackLabel: 'Код телефона' });
  return result.success;
}

// ── Background sync ────────────────────────────────────────────────────────

const SYNC_TASK = 'mg-background-sync';

// Must be defined at module load (this file is imported from the root layout),
// so Android can run it while the app is closed.
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    // Refreshing the lists also refreshes the offline copy (lib/api.ts cachedRequest).
    await Promise.all([api.applications(false), api.applications(true), api.checkLog(100)]);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function isBackgroundSyncOn(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
  } catch {
    return false;
  }
}

export async function setBackgroundSync(on: boolean): Promise<void> {
  if (on) await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 30 });
  else if (await isBackgroundSyncOn()) await BackgroundTask.unregisterTaskAsync(SYNC_TASK);
}
