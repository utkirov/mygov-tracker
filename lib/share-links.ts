/**
 * Client share links: `/s/<token>` shows one application's progress — or all
 * applications of a client — without logging in, for a limited time
 * (30 min … 30 days) or until revoked, optionally behind a PIN. The page only
 * gets a sanitised view — never the check password, phones, notes, the
 * application PDF or the my.gov screenshot (it shows INN and phones).
 *
 * Every opening is logged (time + device type, no IP); a Telegram chat can
 * subscribe to a link (/start s_<token> in the bot) and then gets the stage
 * changes while the link is active (lib/client-notify.ts).
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { readArtifacts, readChecklist } from './application-artifacts';
import type { Checklist } from './checklist';
import { clientApplications, getClient } from './clients';
import { getApplicationById, getStatusHistory, type LocalDbApplication } from './local-db';
import { openDb } from './sqlite-db';
import { makeShareSlug, SLUG_RE } from './slug';
import { getMyGovStatus, getStatusType, isCompletedStatus } from '@/types';

export interface ShareLink {
  token: string;
  /** '' for a client-wide link. */
  application_id: string;
  client_id: string | null;
  label: string;
  show_documents: boolean;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  views: number;
  last_viewed_at: string | null;
  has_pin: boolean;
  /** Readable address part (/s/<slug>); null for links made before slugs — filled lazily. */
  slug: string | null;
}

interface Row extends Omit<ShareLink, 'show_documents' | 'has_pin'> { show_documents: number; pin_hash: string | null }

export const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
/** Allowed lifetimes in minutes; null = until revoked. */
export const SHARE_DURATIONS = [30, 60, 24 * 60, 7 * 24 * 60, 30 * 24 * 60, null] as const;
const PIN_RE = /^\d{4,8}$/;

const toLink = (r: Row): ShareLink => ({
  token: r.token,
  application_id: r.application_id,
  client_id: r.client_id ?? null,
  label: r.label,
  show_documents: r.show_documents === 1,
  created_at: r.created_at,
  expires_at: r.expires_at,
  revoked_at: r.revoked_at,
  views: r.views,
  last_viewed_at: r.last_viewed_at,
  has_pin: !!r.pin_hash,
  slug: r.slug ?? null,
});

export function isShareLinkActive(link: ShareLink, now = new Date()): boolean {
  return !link.revoked_at && (!link.expires_at || Date.parse(link.expires_at) > now.getTime());
}

function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pin, salt, 32).toString('hex')}`;
}

interface CreateOptions { minutes: number | null; label?: string; showDocuments?: boolean; pin?: string }

async function insertLink(target: { applicationId: string } | { clientId: string }, opts: CreateOptions, rootPath?: string, now = new Date()): Promise<ShareLink> {
  if (!(SHARE_DURATIONS as readonly (number | null)[]).includes(opts.minutes)) throw new Error('Недопустимый срок ссылки');
  const pin = (opts.pin ?? '').trim();
  if (pin && !PIN_RE.test(pin)) throw new Error('PIN — от 4 до 8 цифр');
  const db = await openDb(rootPath);
  const slug = await uniqueSlug(db, await slugParts(target, rootPath));
  const row: Row = {
    token: randomBytes(18).toString('base64url'),
    application_id: 'applicationId' in target ? target.applicationId : '',
    client_id: 'clientId' in target ? target.clientId : null,
    label: (opts.label ?? '').trim().slice(0, 80),
    show_documents: opts.showDocuments === true ? 1 : 0,
    created_at: now.toISOString(),
    expires_at: opts.minutes === null ? null : new Date(now.getTime() + opts.minutes * 60_000).toISOString(),
    revoked_at: null,
    views: 0,
    last_viewed_at: null,
    pin_hash: pin ? hashPin(pin) : null,
    slug,
  };
  db.prepare(`INSERT INTO share_links (token, application_id, client_id, label, show_documents, created_at, expires_at, pin_hash, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.token, row.application_id, row.client_id, row.label, row.show_documents, row.created_at, row.expires_at, row.pin_hash, row.slug);
  return toLink(row);
}

/** Readable words for the address: «<number> <object>» or the client's name. */
async function slugParts(target: { applicationId: string } | { clientId: string }, rootPath?: string): Promise<string[]> {
  if ('clientId' in target) return [(await getClient(target.clientId, rootPath).catch(() => null))?.name ?? ''];
  const app = await getApplicationById(target.applicationId, rootPath).catch(() => null);
  return app ? [app.application_number, app.object_name || app.service_name] : [];
}

async function uniqueSlug(db: Awaited<ReturnType<typeof openDb>>, parts: string[]): Promise<string> {
  for (;;) {
    const slug = makeShareSlug(parts);
    if (!db.prepare('SELECT 1 FROM share_links WHERE slug = ?').get(slug)) return slug;
  }
}

/** Gives a pre-slug link its readable address (once; the old /s/<token> keeps working). */
export async function ensureSlug(link: ShareLink, rootPath?: string): Promise<ShareLink> {
  if (link.slug) return link;
  const db = await openDb(rootPath);
  const slug = await uniqueSlug(db, await slugParts(link.client_id ? { clientId: link.client_id } : { applicationId: link.application_id }, rootPath));
  db.prepare('UPDATE share_links SET slug = ? WHERE token = ? AND slug IS NULL').run(slug, link.token);
  return { ...link, slug };
}

export function createShareLink(applicationId: string, opts: CreateOptions, rootPath?: string, now = new Date()): Promise<ShareLink> {
  return insertLink({ applicationId }, opts, rootPath, now);
}

export function createClientShareLink(clientId: string, opts: CreateOptions, rootPath?: string, now = new Date()): Promise<ShareLink> {
  return insertLink({ clientId }, opts, rootPath, now);
}

export async function listShareLinks(applicationId: string, rootPath?: string): Promise<ShareLink[]> {
  const db = await openDb(rootPath);
  return (db.prepare("SELECT * FROM share_links WHERE application_id = ? AND application_id <> '' ORDER BY created_at DESC").all(applicationId) as Row[]).map(toLink);
}

export async function listClientShareLinks(clientId: string, rootPath?: string): Promise<ShareLink[]> {
  const db = await openDb(rootPath);
  return (db.prepare('SELECT * FROM share_links WHERE client_id = ? ORDER BY created_at DESC').all(clientId) as Row[]).map(toLink);
}

/** Every link, newest first — the «Ссылки» page. */
export async function listAllShareLinks(rootPath?: string): Promise<ShareLink[]> {
  const db = await openDb(rootPath);
  return (db.prepare('SELECT * FROM share_links ORDER BY created_at DESC').all() as Row[]).map(toLink);
}

/**
 * «Продлить»: a new lifetime counted from now (null = until revoked). Works for
 * an expired link too — the same URL starts working again; a revoked one stays dead.
 */
export async function extendShareLink(token: string, minutes: number | null, rootPath?: string, now = new Date()): Promise<ShareLink | null> {
  if (!TOKEN_RE.test(token)) return null;
  if (!(SHARE_DURATIONS as readonly (number | null)[]).includes(minutes)) throw new Error('Недопустимый срок ссылки');
  const db = await openDb(rootPath);
  const expires = minutes === null ? null : new Date(now.getTime() + minutes * 60_000).toISOString();
  const changed = db.prepare('UPDATE share_links SET expires_at = ? WHERE token = ? AND revoked_at IS NULL').run(expires, token).changes;
  return changed ? findShareLink(token, rootPath) : null;
}

export async function revokeShareLink(token: string, rootPath?: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const db = await openDb(rootPath);
  return db.prepare('UPDATE share_links SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL').run(new Date().toISOString(), token).changes > 0;
}

/** By token or by readable address — /s/<token> and /s/<slug> open the same link. */
async function findRow(address: string, rootPath?: string): Promise<Row | null> {
  if (!TOKEN_RE.test(address) && !SLUG_RE.test(address)) return null;
  const db = await openDb(rootPath);
  return (db.prepare('SELECT * FROM share_links WHERE token = ? OR slug = ?').get(address, address) as Row | undefined) ?? null;
}

/** The link if it exists (active or not); accepts the token or the slug. */
export async function findShareLink(token: string, rootPath?: string): Promise<ShareLink | null> {
  const row = await findRow(token, rootPath);
  return row ? toLink(row) : null;
}

/**
 * Messengers fetch a link the moment it's pasted into a chat to build the
 * preview card (TelegramBot, WhatsApp, VK…). That is not the client opening it.
 */
export function isLinkPreviewBot(ua: string): boolean {
  return /TelegramBot|WhatsApp|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|vkShare|SkypeUriPreview|LinkedInBot|bot|crawler|spider|preview/i.test(ua);
}

/** «Android», «iPhone», «Windows»… — enough to tell the client's phone from a forwarded copy. */
export function deviceFromUserAgent(ua: string): string {
  if (isLinkPreviewBot(ua)) return 'предпросмотр';
  const parts: string[] = [];
  if (/iPhone/i.test(ua)) parts.push('iPhone');
  else if (/iPad/i.test(ua)) parts.push('iPad');
  else if (/Android/i.test(ua)) parts.push('Android');
  else if (/Windows/i.test(ua)) parts.push('Windows');
  else if (/Mac OS X|Macintosh/i.test(ua)) parts.push('Mac');
  else if (/Linux/i.test(ua)) parts.push('Linux');
  if (/Telegram/i.test(ua)) parts.push('Telegram');
  return parts.join(' · ') || 'неизвестно';
}

/** Where the page was opened: a messenger's built-in browser or a regular one. */
export function appFromUserAgent(ua: string): string {
  if (/Telegram/i.test(ua)) return 'Telegram';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/WhatsApp/i.test(ua)) return 'WhatsApp';
  if (/YaBrowser|YaSearchBrowser/i.test(ua)) return 'Яндекс Браузер';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
  if (/CriOS|Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'браузер';
}

export interface ShareVisit {
  userAgent: string;
  /** Visitor address — only hashed (with SESSION_SECRET) to count unique visitors, never stored. */
  ip?: string;
  /** From Cloudflare (cf-ipcountry / cf-ipcity) for tunnel requests. */
  country?: string;
  city?: string;
}

export interface ShareViewRow { viewed_at: string; device: string; app: string; country: string; city: string; visitor: string }

function visitorHash(visit: ShareVisit): string {
  return createHmac('sha256', process.env.SESSION_SECRET || 'share-visitors')
    .update(`${visit.ip ?? ''}|${visit.userAgent}`).digest('base64url').slice(0, 12);
}

/**
 * Counts an opening of an active link and logs it (last 300 per link are kept).
 * The same visitor within 15 minutes is one view — the page refreshes itself every 5.
 * Messenger preview bots are not views.
 */
export async function recordShareView(token: string, visit: ShareVisit, rootPath?: string, now = new Date()): Promise<void> {
  if (isLinkPreviewBot(visit.userAgent)) return;
  const db = await openDb(rootPath);
  const at = now.toISOString();
  const device = deviceFromUserAgent(visit.userAgent);
  const visitor = visitorHash(visit);
  const recent = db.prepare('SELECT 1 FROM share_link_views WHERE token = ? AND visitor = ? AND viewed_at > ? LIMIT 1')
    .get(token, visitor, new Date(now.getTime() - 15 * 60_000).toISOString());
  if (recent) return;
  const country = (visit.country ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  const city = (visit.city ?? '').slice(0, 80);
  db.transaction(() => {
    db.prepare('UPDATE share_links SET views = views + 1, last_viewed_at = ? WHERE token = ?').run(at, token);
    db.prepare('INSERT INTO share_link_views (token, viewed_at, device, app, country, city, visitor) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(token, at, device, appFromUserAgent(visit.userAgent), country, city, visitor);
    db.prepare(`DELETE FROM share_link_views WHERE token = ? AND viewed_at < (
      SELECT viewed_at FROM share_link_views WHERE token = ? ORDER BY viewed_at DESC LIMIT 1 OFFSET 299)`).run(token, token);
  })();
}

export async function listShareViews(token: string, limit = 30, rootPath?: string): Promise<ShareViewRow[]> {
  const db = await openDb(rootPath);
  return db.prepare('SELECT viewed_at, device, app, country, city, visitor FROM share_link_views WHERE token = ? ORDER BY viewed_at DESC LIMIT ?')
    .all(token, limit) as ShareViewRow[];
}

export interface ShareStats {
  views: number;
  visitors: number;
  first_at: string | null;
  last_at: string | null;
  devices: Array<{ name: string; count: number }>;
  apps: Array<{ name: string; count: number }>;
  places: Array<{ name: string; count: number }>;
  /** Views per day for the last 14 days, oldest first. */
  days: Array<{ day: string; count: number }>;
}

const top = (values: string[]) => [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())]
  .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

/** One link's analytics from its view log (last 300 openings). */
export async function shareStats(token: string, rootPath?: string, now = new Date()): Promise<ShareStats> {
  const rows = await listShareViews(token, 300, rootPath);
  const days: ShareStats['days'] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    days.push({ day, count: rows.filter(r => r.viewed_at.startsWith(day)).length });
  }
  return {
    views: rows.length,
    visitors: new Set(rows.map(r => r.visitor || r.device)).size,
    first_at: rows.at(-1)?.viewed_at ?? null,
    last_at: rows[0]?.viewed_at ?? null,
    devices: top(rows.map(r => r.device.split(' · ')[0] || 'неизвестно')),
    apps: top(rows.map(r => r.app || 'не записано')),
    places: top(rows.map(r => placeName(r))),
    days,
  };
}

const COUNTRY: Record<string, string> = { UZ: 'Узбекистан', RU: 'Россия', KZ: 'Казахстан', TR: 'Турция', US: 'США', DE: 'Германия', KG: 'Кыргызстан', TJ: 'Таджикистан', AE: 'ОАЭ' };

/** «Ташкент, Узбекистан» / «Узбекистан» / «не определено» (views before location was recorded, or from the office network). */
export function placeName(r: Pick<ShareViewRow, 'country' | 'city'>): string {
  const country = r.country ? (COUNTRY[r.country] ?? r.country) : '';
  return [r.city, country].filter(Boolean).join(', ') || 'не определено';
}

// ── PIN ────────────────────────────────────────────────────────────────────

const pinAttempts = new Map<string, { count: number; first: number }>();
const PIN_WINDOW_MS = 15 * 60_000;
const PIN_MAX_ATTEMPTS = 5;

/** true — PIN right; false — wrong; 'locked' — too many attempts on this link, wait 15 minutes. */
export async function checkSharePin(token: string, pin: string, rootPath?: string, now = Date.now()): Promise<boolean | 'locked'> {
  const row = await findRow(token, rootPath);
  if (!row?.pin_hash) return false;
  const a = pinAttempts.get(token);
  if (a && now - a.first < PIN_WINDOW_MS && a.count >= PIN_MAX_ATTEMPTS) return 'locked';
  const [saltHex, hashHex] = row.pin_hash.split(':');
  const ok = PIN_RE.test(pin) && timingSafeEqual(scryptSync(pin, Buffer.from(saltHex, 'hex'), 32), Buffer.from(hashHex, 'hex'));
  if (ok) { pinAttempts.delete(token); return true; }
  if (!a || now - a.first >= PIN_WINDOW_MS) pinAttempts.set(token, { count: 1, first: now });
  else a.count += 1;
  return false;
}

const unlockSecret = () => process.env.SESSION_SECRET || (globalThis.__shareUnlockSecret ??= randomBytes(32).toString('hex'));
declare global { var __shareUnlockSecret: string | undefined }

export const unlockCookieName = (token: string) => `su_${token}`;

/** Cookie value proving the PIN was entered; changes if the PIN is replaced. */
export async function unlockValue(token: string, rootPath?: string): Promise<string | null> {
  const row = await findRow(token, rootPath);
  if (!row?.pin_hash) return null;
  return createHmac('sha256', unlockSecret()).update(`${token}:${row.pin_hash}`).digest('base64url');
}

export async function isUnlocked(token: string, cookieValue: string | undefined, rootPath?: string): Promise<boolean> {
  const expected = await unlockValue(token, rootPath);
  if (!expected) return true;
  if (!cookieValue || cookieValue.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(cookieValue), Buffer.from(expected));
}

// ── Telegram subscriptions ────────────────────────────────────────────────

/**
 * Telegram deep-link payload for «Подписаться»: s_<token>, plus a 12-char
 * signature for PIN links — the page hands it out only after the PIN, so the
 * bare link can't be used to follow a protected client.
 */
export async function subscribePayload(token: string, rootPath?: string): Promise<string> {
  const unlock = await unlockValue(token, rootPath);
  return `s_${token}${unlock ? unlock.slice(0, 12) : ''}`;
}

/** /start s_<token>[sig]: the chat follows this link while it is active. */
export async function subscribeChat(payload: string, chatId: string, rootPath?: string): Promise<ShareLink | null> {
  const m = payload.match(/^s_([A-Za-z0-9_-]{24})([A-Za-z0-9_-]{12})?$/);
  if (!m) return null;
  const [, token, sig] = m;
  const link = await findShareLink(token, rootPath);
  if (!link || !isShareLinkActive(link)) return null;
  if (link.has_pin && sig !== (await unlockValue(token, rootPath))?.slice(0, 12)) return null;
  const db = await openDb(rootPath);
  db.prepare(`INSERT INTO share_subscriptions (token, chat_id, created_at, active) VALUES (?, ?, ?, 1)
    ON CONFLICT(token, chat_id) DO UPDATE SET active = 1`).run(token, chatId, new Date().toISOString());
  return link;
}

export async function unsubscribeChat(chatId: string, rootPath?: string): Promise<number> {
  const db = await openDb(rootPath);
  return db.prepare('UPDATE share_subscriptions SET active = 0 WHERE chat_id = ? AND active = 1').run(chatId).changes;
}

export async function isSubscriberChat(chatId: string, rootPath?: string): Promise<boolean> {
  const db = await openDb(rootPath);
  return !!db.prepare('SELECT 1 FROM share_subscriptions WHERE chat_id = ? LIMIT 1').get(chatId);
}

export async function countSubscribers(tokens: string[], rootPath?: string): Promise<Map<string, number>> {
  if (tokens.length === 0) return new Map();
  const db = await openDb(rootPath);
  const rows = db.prepare(`SELECT token, COUNT(*) AS n FROM share_subscriptions WHERE active = 1 AND token IN (${tokens.map(() => '?').join(',')}) GROUP BY token`)
    .all(...tokens) as Array<{ token: string; n: number }>;
  return new Map(rows.map(r => [r.token, r.n]));
}

/** Chats to notify about an application: subscribers of its own links and of its client's links. */
export async function subscribersFor(applicationId: string, clientId: string | null, rootPath?: string, now = new Date()): Promise<Array<{ chat_id: string; link: ShareLink }>> {
  const db = await openDb(rootPath);
  const rows = db.prepare(`SELECT s.chat_id, l.* FROM share_subscriptions s JOIN share_links l ON l.token = s.token
    WHERE s.active = 1 AND ((l.application_id = ? AND l.application_id <> '') OR (l.client_id IS NOT NULL AND l.client_id = ?))`)
    .all(applicationId, clientId ?? '') as Array<Row & { chat_id: string }>;
  const seen = new Set<string>();
  const out: Array<{ chat_id: string; link: ShareLink }> = [];
  for (const r of rows) {
    const link = toLink(r);
    if (!isShareLinkActive(link, now) || seen.has(r.chat_id)) continue;
    seen.add(r.chat_id);
    out.push({ chat_id: r.chat_id, link });
  }
  return out;
}

// ── public views ──────────────────────────────────────────────────────────

export interface ShareView {
  id: string;
  application_number: string;
  title: string;
  service_name: string;
  organization: string;
  status: string;
  status_type: 'action_required' | 'in_progress' | 'completed';
  completed: boolean;
  current_action: string;
  acting_party: string;
  submission_date: string | null;
  last_changed_date: string | null;
  last_checked_at: string | null;
  history: Array<{ status: string; current_action: string; recorded_at: string }>;
  checklist: Pick<Checklist, 'progress' | 'outcome' | 'orgs' | 'counts' | 'result' | 'stages'> | null;
  documents: Array<{ file: string; title: string; size: number }>;
}

export interface ClientShareView { client_name: string; applications: ShareView[] }

async function appView(app: LocalDbApplication, showDocuments: boolean, rootPath?: string): Promise<ShareView> {
  const [history, checklist, artifacts] = await Promise.all([
    getStatusHistory(app.id, rootPath),
    readChecklist(app.id, rootPath),
    showDocuments ? readArtifacts(app.id, rootPath) : null,
  ]);
  return {
    id: app.id,
    application_number: app.application_number,
    title: app.object_name || app.service_name || `Заявление № ${app.application_number}`,
    service_name: app.service_name,
    organization: app.organization,
    status: getMyGovStatus(app.status).label,
    status_type: getStatusType(app.acting_party, app.status),
    completed: isCompletedStatus(app.status),
    current_action: app.current_action,
    acting_party: app.acting_party,
    submission_date: app.submission_date,
    last_changed_date: app.last_changed_date,
    last_checked_at: app.last_checked_at,
    history: history
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
      .map(h => ({ status: getMyGovStatus(h.status).label, current_action: h.current_action, recorded_at: h.recorded_at })),
    checklist: checklist
      ? { progress: checklist.progress ?? [], outcome: checklist.outcome ?? null, orgs: checklist.orgs, counts: checklist.counts, result: checklist.result, stages: checklist.stages }
      : null,
    documents: artifacts ? artifacts.results.map(r => ({ file: r.file, title: r.title || 'Документ', size: r.size })) : [],
  };
}

/** Everything the public page may show for a single-application link — and nothing else. */
export async function buildShareView(link: ShareLink, rootPath?: string): Promise<ShareView | null> {
  if (!link.application_id) return null;
  const app = await getApplicationById(link.application_id, rootPath);
  return app ? appView(app, link.show_documents, rootPath) : null;
}

/** A client-wide link: the client's name and each of their applications (active first, newest first). */
export async function buildClientShareView(link: ShareLink, rootPath?: string): Promise<ClientShareView | null> {
  if (!link.client_id) return null;
  const client = await getClient(link.client_id, rootPath);
  if (!client) return null;
  const apps = (await clientApplications(client.id, rootPath))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || (b.submission_date ?? b.created_at).localeCompare(a.submission_date ?? a.created_at));
  return { client_name: client.name, applications: await Promise.all(apps.map(a => appView(a, link.show_documents, rootPath))) };
}

/** Applications a link gives access to (for the document route). */
export async function linkApplicationIds(link: ShareLink, rootPath?: string): Promise<string[]> {
  if (link.application_id) return [link.application_id];
  if (link.client_id) return (await clientApplications(link.client_id, rootPath)).map(a => a.id);
  return [];
}

/** Public address (Cloudflare Tunnel) — links are for clients outside the office network. */
export function shareUrl(link: Pick<ShareLink, 'token' | 'slug'>): string {
  const base = (process.env.PUBLIC_BASE_URL?.trim() || 'https://tracker.turonproject.uz').replace(/\/+$/, '');
  return `${base}/s/${link.slug ?? link.token}`;
}
