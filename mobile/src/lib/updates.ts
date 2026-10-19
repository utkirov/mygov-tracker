import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { useEffect, useState } from 'react';

import { API_BASE, authHeaders } from '@/lib/api';

/**
 * Stage 8, part 1 — full APK updates from our own server (design A8).
 * The website publishes an APK in Settings → «Приложение Android»; the phone
 * compares that versionCode with its own build. JS-only changes come through
 * expo-updates (EAS Update, channel "production") without reinstalling.
 */
export interface AppRelease {
  version: string;
  versionCode: number;
  notes: string;
  size: number;
}

const FLAG_GRANT_READ_URI_PERMISSION = 1;

export function installedVersionCode(): number {
  return Number.parseInt(Application.nativeBuildVersion ?? '0', 10) || 0;
}

export async function fetchAvailableUpdate(): Promise<AppRelease | null> {
  try {
    const response = await fetch(`${API_BASE}/api/app-release`, { headers: { Accept: 'application/json', ...(await authHeaders()) } });
    if (!response.ok) return null;
    const { release } = await response.json() as { release: AppRelease | null };
    return release && release.versionCode > installedVersionCode() ? release : null;
  } catch {
    return null;
  }
}

/** Downloads the APK (reporting 0..1 progress) and opens Android's installer. */
export async function downloadAndInstall(release: AppRelease, onProgress: (fraction: number, bytes: number) => void): Promise<void> {
  const destination = new File(Paths.cache, `mygov-tracker-${release.version}.apk`);
  if (destination.exists) destination.delete();
  const task = File.createDownloadTask(`${API_BASE}/api/app-release/apk`, destination, {
    headers: await authHeaders(),
    onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes > 0 ? totalBytes : release.size;
      onProgress(total > 0 ? Math.min(1, bytesWritten / total) : 0, bytesWritten);
    },
  });
  const file = await task.downloadAsync();
  if (!file) throw new Error('Загрузка прервана');
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: 'application/vnd.android.package-archive',
  });
}

/** Checks once per app start. */
export function useAvailableUpdate(): { update: AppRelease | null; dismiss: () => void } {
  const [update, setUpdate] = useState<AppRelease | null>(null);
  useEffect(() => {
    void fetchAvailableUpdate().then(setUpdate);
  }, []);
  return { update, dismiss: () => setUpdate(null) };
}
