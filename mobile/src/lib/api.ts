import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

export const API_BASE: string = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'https://tracker.turonproject.uz';

const TOKEN_KEY = 'mg_device_token';

export interface Application {
  id: string;
  application_number: string;
  object_name: string;
  service_name: string;
  organization: string;
  status: string;
  current_action: string;
  acting_party: string;
  submission_date: string | null;
  last_changed_date: string | null;
  last_checked_at: string | null;
  last_detected_change_at: string | null;
  last_change_fields: string[];
  last_change_summary: string[];
  sync_state: string;
  last_error: string;
  archived: boolean;
  parent_id: string | null;
  updated_at: string;
}

export interface StatusHistoryEntry { id: string; status: string; current_action: string; acting_party: string; recorded_at: string }

export class UnauthorizedError extends Error {}

let tokenCache: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (tokenCache === undefined) tokenCache = await SecureStore.getItemAsync(TOKEN_KEY);
  return tokenCache;
}

async function setToken(token: string | null): Promise<void> {
  tokenCache = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401) {
    await setToken(null);
    throw new UnauthorizedError('Требуется вход');
  }
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Ошибка сервера (${response.status})`);
  return payload;
}

export async function login(username: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password, device: { name: Device.modelName ?? 'Android' } }),
  });
  const payload = await response.json().catch(() => ({})) as { token?: string; error?: string };
  if (!response.ok || !payload.token) throw new Error(payload.error ?? 'Не удалось войти');
  await setToken(payload.token);
}

export async function logout(): Promise<void> {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch {
    // offline or already revoked — forget the token anyway
  }
  await setToken(null);
}

export const api = {
  applications: (archived = false) => request<Application[]>(`/api/applications${archived ? '?archived=true' : ''}`),
  application: (id: string) => request<{ application: Application; history: StatusHistoryEntry[] }>(`/api/applications/${encodeURIComponent(id)}`),
  check: (id: string) => request<unknown>(`/api/applications/${encodeURIComponent(id)}/check?manual=true`, { method: 'POST' }),
  registerPush: (token: string) => request('/api/push/register', { method: 'POST', body: JSON.stringify({ token, platform: 'android', deviceName: Device.modelName ?? '' }) }),
  unregisterPush: (token: string) => request(`/api/push/register?token=${encodeURIComponent(token)}`, { method: 'DELETE' }),
};
