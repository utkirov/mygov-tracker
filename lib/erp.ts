/**
 * Связь с ERP «TPG Проекты» (часть Б).
 *   - список проектов ERP для выбора при добавлении заявления (GET <ERP>/api/integration/projects);
 *   - выбранный проект хранится здесь, в erp_links (application_id → erp_project_id), и отдаётся ERP вместе с заявлением;
 *   - после проверки с изменениями трекер сообщает ERP (POST <ERP>/api/integration/tracker), ERP сразу забирает изменения.
 * Общий секрет INTEGRATION_KEY — в .env.local обеих программ, заголовок x-integration-key. Без ключа связь выключена.
 * Вход в ERP и трекер остаётся раздельным.
 */
import { timingSafeEqual } from 'node:crypto';

import { openDb } from './sqlite-db';

export const ERP_URL = (process.env.ERP_URL || 'http://localhost:3050').replace(/\/$/, '');
const HEADER = 'x-integration-key';

const key = () => process.env.INTEGRATION_KEY ?? '';
export const erpEnabled = () => key().length >= 24;
const headers = (): Record<string, string> => ({ [HEADER]: key() });

/** Запрос пришёл от ERP (по ключу). Если ключ не настроен — доверяем только тому, что прошло proxy (локальная сеть). */
export function erpKeyOk(req: Request): boolean {
  if (!erpEnabled()) return true;
  const got = req.headers.get(HEADER) ?? '';
  return got.length === key().length && timingSafeEqual(Buffer.from(got), Buffer.from(key()));
}

export interface ErpProject { id: string; obj: string; client: string | null; stage: string; state: string }

let cache: { at: number; projects: ErpProject[] } | null = null;

/** Проекты ERP (кэш 60 секунд). null — ERP недоступна или связь не настроена. */
export async function listErpProjects(): Promise<ErpProject[] | null> {
  if (!erpEnabled()) return null;
  if (cache && Date.now() - cache.at < 60_000) return cache.projects;
  try {
    const r = await fetch(`${ERP_URL}/api/integration/projects`, { headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const { projects } = (await r.json()) as { projects: ErpProject[] };
    cache = { at: Date.now(), projects };
    return projects;
  } catch {
    return null;
  }
}

const ERP_ID = /^[A-Za-z0-9-]{1,40}$/;

export async function getErpLinks(): Promise<Map<string, string>> {
  const db = await openDb();
  const rows = db.prepare('SELECT application_id, erp_project_id FROM erp_links').all() as { application_id: string; erp_project_id: string }[];
  return new Map(rows.map(r => [r.application_id, r.erp_project_id]));
}

/** Выбор проекта ERP для заявления; пустое значение — снять выбор. */
export async function setErpLink(applicationId: string, erpProjectId: unknown): Promise<void> {
  const db = await openDb();
  const value = typeof erpProjectId === 'string' ? erpProjectId.trim() : '';
  if (!value) {
    db.prepare('DELETE FROM erp_links WHERE application_id = ?').run(applicationId);
    return;
  }
  if (!ERP_ID.test(value)) throw new Error('Неверный номер проекта ERP');
  db.prepare(`INSERT INTO erp_links (application_id, erp_project_id, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(application_id) DO UPDATE SET erp_project_id = excluded.erp_project_id, updated_at = excluded.updated_at`)
    .run(applicationId, value, new Date().toISOString());
}

/** Сообщить ERP, что заявление изменилось. Не ждёт ответа и никогда не бросает — проверка не должна тормозить. */
export function notifyErp(applicationId: string, event: string): void {
  if (!erpEnabled()) return;
  fetch(`${ERP_URL}/api/integration/tracker`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: applicationId, event }),
    signal: AbortSignal.timeout(5000),
  }).catch(err => console.warn('[ERP] событие не доставлено:', err instanceof Error ? err.message : err));
}
