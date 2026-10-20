/**
 * Clients: who an application is for. One client — many applications
 * (client_applications). A resubmission (parent_id) belongs to the parent's
 * client unless assigned explicitly, so the chain never has to be re-tagged.
 */
import { randomUUID } from 'node:crypto';

import { clearAnalyticsCache } from './analytics';
import { listApplications, type LocalDbApplication } from './local-db';
import { openDb } from './sqlite-db';

export interface Client {
  id: string;
  name: string;
  phone: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface ClientSummary extends Client {
  total: number;
  active: number;
  last_change_at: string | null;
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function createClient(input: { name: string; phone?: string; note?: string }, rootPath?: string): Promise<Client> {
  const name = clean(input.name, 120);
  if (!name) throw new Error('Укажите имя клиента');
  const now = new Date().toISOString();
  const client: Client = { id: randomUUID(), name, phone: clean(input.phone, 40), note: clean(input.note, 1000), created_at: now, updated_at: now };
  const db = await openDb(rootPath);
  db.prepare('INSERT INTO clients (id, name, phone, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(client.id, client.name, client.phone, client.note, client.created_at, client.updated_at);
  clearAnalyticsCache();
  return client;
}

export async function getClient(id: string, rootPath?: string): Promise<Client | null> {
  const db = await openDb(rootPath);
  return (db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Client | undefined) ?? null;
}

export async function updateClient(id: string, patch: { name?: string; phone?: string; note?: string }, rootPath?: string): Promise<Client | null> {
  const current = await getClient(id, rootPath);
  if (!current) return null;
  const next: Client = {
    ...current,
    name: patch.name !== undefined ? clean(patch.name, 120) || current.name : current.name,
    phone: patch.phone !== undefined ? clean(patch.phone, 40) : current.phone,
    note: patch.note !== undefined ? clean(patch.note, 1000) : current.note,
    updated_at: new Date().toISOString(),
  };
  const db = await openDb(rootPath);
  db.prepare('UPDATE clients SET name = ?, phone = ?, note = ?, updated_at = ? WHERE id = ?').run(next.name, next.phone, next.note, next.updated_at, id);
  clearAnalyticsCache();
  return next;
}

/** Removes the client, its assignments, and revokes its client-wide share links. */
export async function deleteClient(id: string, rootPath?: string): Promise<boolean> {
  const db = await openDb(rootPath);
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM client_applications WHERE client_id = ?').run(id);
    db.prepare('UPDATE share_links SET revoked_at = ? WHERE client_id = ? AND revoked_at IS NULL').run(now, id);
    return db.prepare('DELETE FROM clients WHERE id = ?').run(id).changes > 0;
  });
  const removed = tx();
  clearAnalyticsCache();
  return removed;
}

export async function setApplicationClient(applicationId: string, clientId: string | null, rootPath?: string): Promise<void> {
  const db = await openDb(rootPath);
  clearAnalyticsCache();
  if (clientId === null) {
    db.prepare('DELETE FROM client_applications WHERE application_id = ?').run(applicationId);
    return;
  }
  if (!(await getClient(clientId, rootPath))) throw new Error('Клиент не найден');
  db.prepare('INSERT INTO client_applications (application_id, client_id) VALUES (?, ?) ON CONFLICT(application_id) DO UPDATE SET client_id = excluded.client_id')
    .run(applicationId, clientId);
}

/** application id → client id, with resubmissions inheriting the parent's client. */
export function resolveClientIds(apps: Pick<LocalDbApplication, 'id' | 'parent_id'>[], direct: Map<string, string>): Map<string, string> {
  const parentOf = new Map(apps.map(a => [a.id, a.parent_id]));
  const result = new Map<string, string>();
  for (const app of apps) {
    let cursor: string | null | undefined = app.id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const client = direct.get(cursor);
      if (client) { result.set(app.id, client); break; }
      cursor = parentOf.get(cursor);
    }
  }
  return result;
}

/** Every application's client (after inheritance) plus the client records. */
export async function loadClientIndex(rootPath?: string, apps?: LocalDbApplication[]): Promise<{ byApplication: Map<string, Client>; clients: Map<string, Client> }> {
  const db = await openDb(rootPath);
  const clients = new Map((db.prepare('SELECT * FROM clients').all() as Client[]).map(c => [c.id, c]));
  const direct = new Map((db.prepare('SELECT application_id, client_id FROM client_applications').all() as Array<{ application_id: string; client_id: string }>)
    .filter(r => clients.has(r.client_id))
    .map(r => [r.application_id, r.client_id]));
  const all = apps ?? await listApplications({}, rootPath);
  const ids = resolveClientIds(all, direct);
  const byApplication = new Map<string, Client>();
  for (const [appId, clientId] of ids) byApplication.set(appId, clients.get(clientId)!);
  return { byApplication, clients };
}

export async function clientApplications(clientId: string, rootPath?: string): Promise<LocalDbApplication[]> {
  const apps = await listApplications({}, rootPath);
  const { byApplication } = await loadClientIndex(rootPath, apps);
  return apps.filter(a => byApplication.get(a.id)?.id === clientId);
}

export async function clientOfApplication(applicationId: string, rootPath?: string): Promise<Client | null> {
  return (await loadClientIndex(rootPath)).byApplication.get(applicationId) ?? null;
}

export async function listClients(rootPath?: string): Promise<ClientSummary[]> {
  const apps = await listApplications({}, rootPath);
  const { byApplication, clients } = await loadClientIndex(rootPath, apps);
  return [...clients.values()].map(c => {
    const mine = apps.filter(a => byApplication.get(a.id)?.id === c.id);
    const last = mine.map(a => a.last_detected_change_at ?? a.updated_at).filter(Boolean).sort().at(-1) ?? null;
    return { ...c, total: mine.length, active: mine.filter(a => !a.archived).length, last_change_at: last };
  }).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, 'ru'));
}

/**
 * Client names hidden in object names: «Mirabror aka uchastka», «Shirinbek aka - 2 uchastka»,
 * «Иван Петрович склад». Only unassigned applications; a name must repeat or carry «aka/opa».
 */
export function suggestClients(apps: Pick<LocalDbApplication, 'id' | 'object_name'>[], assigned: Set<string>): Array<{ name: string; applicationIds: string[] }> {
  const groups = new Map<string, { name: string; applicationIds: string[] }>();
  for (const app of apps) {
    if (assigned.has(app.id)) continue;
    const m = app.object_name.trim().match(/^([A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ'ʻʼ‘’]{2,}\s+(?:aka|opa|ака|опа))\b/i);
    if (!m) continue;
    const name = m[1].replace(/\s+/g, ' ');
    const key = name.toLowerCase().replace(/[ʻʼ‘’']/g, '');
    const g = groups.get(key) ?? { name: name[0].toUpperCase() + name.slice(1), applicationIds: [] };
    g.applicationIds.push(app.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.applicationIds.length - a.applicationIds.length);
}
