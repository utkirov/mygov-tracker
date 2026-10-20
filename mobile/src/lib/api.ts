import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';

import { clearCache, readCache, writeCache } from '@/lib/cache';

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
  next_check_at: string | null;
  last_detected_change_at: string | null;
  last_change_fields: string[];
  last_change_summary: string[];
  sync_state: string;
  last_error: string;
  archived: boolean;
  parent_id: string | null;
  updated_at: string;
  notes: string;
  verification_password: string;
  sms_phone: string;
  pdf_filename: string;
  result_documents?: number;
  checklist_summary?: ({ total: number; result: 'rejected' | 'approved' | null; failed: number } & Record<ApprovalStatus, number>) | null;
}

export type ApprovalStatus = 'ok' | 'bad' | 'other' | 'wait';
export interface Checklist {
  parsed_at: string;
  stages: Array<{ title: string; date: string; actor: string }>;
  orgs: Array<{ name: string; status: ApprovalStatus; verdict: string; comment: string; date: string; num: number | null }>;
  counts: Record<ApprovalStatus, number> & { total: number };
  result: {
    kind: 'rejected' | 'approved'; stage: string; date: string; actor: string; number: string; conclusionDate: string;
    criteria: Array<{ label: string; value: string; status: ApprovalStatus }>;
    texts: Array<{ label: string; text: string }>;
  } | null;
  chain: string[];
  correction: string;
}

export interface StatusHistoryEntry { id: string; status: string; current_action: string; acting_party: string; recorded_at: string }

export interface ArtifactFile { file: string; size: number; saved_at: string }
export interface ResultDocument extends ArtifactFile { title: string; state: string; pin: string }
export interface ApplicationArtifacts { screenshot: ArtifactFile | null; status_pdf: ArtifactFile | null; results: ResultDocument[] }

export interface CheckLogEntry {
  id: string;
  application_id: string;
  application_number: string;
  checked_at: string;
  result: 'changed' | 'unchanged' | 'error';
  error_message: string | null;
  changed_fields: string;
}

export interface PushPrefs {
  status: boolean;
  errors: boolean;
  completed: boolean;
  cycle: boolean;
  reminders: boolean;
  digest: boolean;
  security: boolean;
  system: boolean;
  quiet: { enabled: boolean; from: string; to: string };
}

export interface HealthInfo {
  ok: boolean;
  scheduler?: { nextCycleAt: string | null; lastCycleFinishedAt: string | null };
  autoCheck?: { enabled: boolean; intervalMinutes: number };
}

export class UnauthorizedError extends Error {}
/** The server couldn't be reached at all (PC off, no internet) — as opposed to it answering with an error. */
export class NetworkError extends Error {}

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

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(await authHeaders()),
        ...init.headers,
      },
    });
  } catch {
    throw new NetworkError('Сервер недоступен');
  }
  if (response.status === 401) {
    await setToken(null);
    throw new UnauthorizedError('Требуется вход');
  }
  // Cloudflare answers 502/530 with an HTML page when the PC behind the tunnel is off.
  if (response.status === 502 || response.status === 530) throw new NetworkError('Сервер недоступен');
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Ошибка сервера (${response.status})`);
  return payload;
}

export interface Loaded<T> {
  data: T;
  /** Set when the server was unreachable and this is the last saved copy. */
  offlineSince: string | null;
}

/** GET that falls back to the last saved copy when the server can't be reached. */
async function cachedRequest<T>(key: string, path: string): Promise<Loaded<T>> {
  try {
    const data = await request<T>(path);
    void writeCache(key, data);
    return { data, offlineSince: null };
  } catch (error) {
    if (error instanceof NetworkError) {
      const cached = await readCache<T>(key);
      if (cached) return { data: cached.data, offlineSince: cached.savedAt };
    }
    throw error;
  }
}

export async function login(username: string, password: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password, device: { name: Device.modelName ?? 'Android' } }),
    });
  } catch {
    throw new NetworkError('Сервер недоступен — компьютер выключен или нет интернета');
  }
  const payload = await response.json().catch(() => ({})) as { token?: string; error?: string };
  if (!response.ok || !payload.token) throw new Error(payload.error ?? 'Не удалось войти');
  await setToken(payload.token);
}

/** Trades a QR code from the website's settings for this phone's own device token. */
export async function pairWithCode(code: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/auth/pair/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code, device: { name: Device.modelName ?? 'Android' } }),
    });
  } catch {
    throw new NetworkError('Сервер недоступен — компьютер выключен или нет интернета');
  }
  const payload = await response.json().catch(() => ({})) as { token?: string; error?: string };
  if (!response.ok || !payload.token) throw new Error(payload.error ?? 'Не удалось привязать телефон');
  await setToken(payload.token);
}

export async function logout(): Promise<void> {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch {
    // offline or already revoked — forget the token anyway
  }
  await setToken(null);
  await clearCache();
}

const enc = encodeURIComponent;

export const api = {
  applications: (archived = false) => cachedRequest<Application[]>(`apps:${archived}`, `/api/applications${archived ? '?archived=true' : ''}`),
  application: (id: string) => cachedRequest<{ application: Application; history: StatusHistoryEntry[] }>(`app:${id}`, `/api/applications/${enc(id)}`),
  artifacts: (id: string) => cachedRequest<ApplicationArtifacts>(`artifacts:${id}`, `/api/applications/${enc(id)}/artifacts`),
  chain: (id: string) => cachedRequest<Application[]>(`chain:${id}`, `/api/applications/${enc(id)}/chain`),
  checkLog: (limit = 100) => cachedRequest<CheckLogEntry[]>('check-log', `/api/check-log?limit=${limit}`),
  checklist: (id: string) => cachedRequest<{ checklist: Checklist | null }>(`checklist:${id}`, `/api/applications/${enc(id)}/checklist`),
  refreshChecklist: (id: string) => request<{ checklist: Checklist }>(`/api/applications/${enc(id)}/checklist`, { method: 'POST' }),
  health: () => request<HealthInfo>('/api/health'),
  check: (id: string) => request<unknown>(`/api/applications/${enc(id)}/check?manual=true`, { method: 'POST' }),
  saveNotes: (id: string, notes: string) => request<Application>(`/api/applications/${enc(id)}`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  fetchResultDocuments: (id: string) => request<ApplicationArtifacts>(`/api/applications/${enc(id)}/artifacts`, { method: 'POST' }),
  pushPrefs: (token: string) => request<{ prefs: PushPrefs; registered: boolean }>(`/api/push/prefs?token=${enc(token)}`),
  savePushPrefs: (token: string, prefs: PushPrefs) => request<{ prefs: PushPrefs }>('/api/push/prefs', { method: 'PUT', body: JSON.stringify({ token, prefs }) }),
  me: () => request<{ username: string | null; authenticated: boolean }>('/api/auth/me'),
  registerPush: (token: string) => request('/api/push/register', { method: 'POST', body: JSON.stringify({ token, platform: 'android', deviceName: Device.modelName ?? '' }) }),
  unregisterPush: (token: string) => request(`/api/push/register?token=${enc(token)}`, { method: 'DELETE' }),
};

export interface ParsedPdf {
  application_number: string;
  service_name: string;
  organization: string;
  status: string;
  submission_date: string;
  last_changed_date: string;
  current_action: string;
  acting_party: string;
  verification_password: string;
  sms_phone: string;
}

/** Uploads a PDF from the phone (picker or "open with") for recognition, like the website's add page. */
export async function parsePdf(file: { uri: string; name: string }): Promise<{ fields: ParsedPdf; filename: string; pdfStorageKey: string }> {
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } and streams content:// URIs itself.
  form.append('file', { uri: file.uri, name: file.name.toLowerCase().endsWith('.pdf') ? file.name : `${file.name}.pdf`, type: 'application/pdf' } as unknown as Blob);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/applications/parse-pdf`, { method: 'POST', body: form, headers: { Accept: 'application/json', ...(await authHeaders()) } });
  } catch {
    throw new NetworkError('Сервер недоступен');
  }
  const payload = await response.json().catch(() => ({})) as { fields?: ParsedPdf; filename?: string; pdfStorageKey?: string; error?: string };
  if (!response.ok || !payload.fields || !payload.filename || !payload.pdfStorageKey) throw new Error(payload.error ?? 'Не удалось прочитать PDF');
  return { fields: payload.fields, filename: payload.filename, pdfStorageKey: payload.pdfStorageKey };
}

export async function createApplication(body: Record<string, unknown>): Promise<string> {
  const payload = await request<{ id?: string }>('/api/applications', { method: 'POST', body: JSON.stringify(body) });
  if (!payload.id) throw new Error('Сервер не вернул заявление');
  return payload.id;
}

/** URL of a stored file; load it with authHeaders() (Image source headers / downloadAndOpen). */
export function artifactUrl(id: string, file: string, version?: string): string {
  return `${API_BASE}/api/applications/${enc(id)}/artifacts/${file}${version ? `?v=${enc(version)}` : ''}`;
}

export function applicationPdfUrl(id: string): string {
  return `${API_BASE}/api/applications/${enc(id)}/pdf`;
}

/**
 * Downloads an authenticated file into the cache folder and hands it to
 * Android's "open with" sheet (PDF viewer, Telegram, Drive…).
 */
export async function downloadAndOpen(url: string, fileName: string, mimeType: string): Promise<void> {
  const safeName = fileName.replace(/[\\/:*?"<>|\s]+/g, '_');
  let file: File;
  try {
    file = await File.downloadFileAsync(url, new File(Paths.cache, safeName), { headers: await authHeaders(), idempotent: true });
  } catch {
    throw new NetworkError('Не удалось скачать файл — сервер недоступен');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}
