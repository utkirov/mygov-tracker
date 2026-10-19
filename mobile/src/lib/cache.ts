import AsyncStorage from '@react-native-async-storage/async-storage';

// Last successful server responses, kept so the app still shows data when the
// PC is off or there's no internet (design A9 «Сервер недоступен»).
const PREFIX = 'mg_cache:';

export interface Cached<T> {
  data: T;
  savedAt: string;
}

export async function readCache<T>(key: string): Promise<Cached<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) as Cached<T> : null;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt: new Date().toISOString() }));
  } catch {
    // Storage full or unavailable — the app just works without the offline copy.
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore
  }
}

/** Small persisted values (last-seen event time etc.). */
export async function readValue(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`mg_value:${key}`);
  } catch {
    return null;
  }
}

export async function writeValue(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`mg_value:${key}`, value);
  } catch {
    // ignore
  }
}
