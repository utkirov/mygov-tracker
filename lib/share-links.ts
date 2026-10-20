/**
 * Client share links: `/s/<token>` shows one application's progress without
 * logging in, for a limited time (30 min … 30 days) or until revoked. The page
 * only gets a sanitised view — never the check password, phones, notes, the
 * application PDF or the my.gov screenshot (it shows INN and phones).
 */
import { randomBytes } from 'node:crypto';

import { readArtifacts, readChecklist } from './application-artifacts';
import type { Checklist } from './checklist';
import { getApplicationById, getStatusHistory } from './local-db';
import { openDb } from './sqlite-db';
import { getMyGovStatus, getStatusType } from '@/types';

export interface ShareLink {
  token: string;
  application_id: string;
  label: string;
  show_documents: boolean;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  views: number;
  last_viewed_at: string | null;
}

interface Row extends Omit<ShareLink, 'show_documents'> { show_documents: number }

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
/** Allowed lifetimes in minutes; null = until revoked. */
export const SHARE_DURATIONS = [30, 60, 24 * 60, 7 * 24 * 60, 30 * 24 * 60, null] as const;

const toLink = (r: Row): ShareLink => ({ ...r, show_documents: r.show_documents === 1 });

export function isShareLinkActive(link: ShareLink, now = new Date()): boolean {
  return !link.revoked_at && (!link.expires_at || Date.parse(link.expires_at) > now.getTime());
}

export async function createShareLink(
  applicationId: string,
  opts: { minutes: number | null; label?: string; showDocuments?: boolean },
  rootPath?: string,
  now = new Date(),
): Promise<ShareLink> {
  if (!(SHARE_DURATIONS as readonly (number | null)[]).includes(opts.minutes)) throw new Error('Недопустимый срок ссылки');
  const db = await openDb(rootPath);
  const link: ShareLink = {
    token: randomBytes(18).toString('base64url'),
    application_id: applicationId,
    label: (opts.label ?? '').trim().slice(0, 80),
    show_documents: opts.showDocuments === true,
    created_at: now.toISOString(),
    expires_at: opts.minutes === null ? null : new Date(now.getTime() + opts.minutes * 60_000).toISOString(),
    revoked_at: null,
    views: 0,
    last_viewed_at: null,
  };
  db.prepare(`INSERT INTO share_links (token, application_id, label, show_documents, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(link.token, link.application_id, link.label, link.show_documents ? 1 : 0, link.created_at, link.expires_at);
  return link;
}

export async function listShareLinks(applicationId: string, rootPath?: string): Promise<ShareLink[]> {
  const db = await openDb(rootPath);
  return (db.prepare('SELECT * FROM share_links WHERE application_id = ? ORDER BY created_at DESC').all(applicationId) as Row[]).map(toLink);
}

export async function revokeShareLink(token: string, rootPath?: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const db = await openDb(rootPath);
  return db.prepare('UPDATE share_links SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL').run(new Date().toISOString(), token).changes > 0;
}

/** The link if it exists (active or not). Counts a view when `countView` and active. */
export async function findShareLink(token: string, opts: { countView?: boolean } = {}, rootPath?: string): Promise<ShareLink | null> {
  if (!TOKEN_RE.test(token)) return null;
  const db = await openDb(rootPath);
  const row = db.prepare('SELECT * FROM share_links WHERE token = ?').get(token) as Row | undefined;
  if (!row) return null;
  const link = toLink(row);
  if (opts.countView && isShareLinkActive(link)) {
    const now = new Date().toISOString();
    db.prepare('UPDATE share_links SET views = views + 1, last_viewed_at = ? WHERE token = ?').run(now, token);
    link.views += 1;
    link.last_viewed_at = now;
  }
  return link;
}

export interface ShareView {
  application_number: string;
  title: string;
  service_name: string;
  organization: string;
  status: string;
  status_type: 'action_required' | 'in_progress' | 'completed';
  current_action: string;
  acting_party: string;
  submission_date: string | null;
  last_changed_date: string | null;
  last_checked_at: string | null;
  history: Array<{ status: string; current_action: string; recorded_at: string }>;
  checklist: Pick<Checklist, 'progress' | 'outcome' | 'orgs' | 'counts' | 'result' | 'stages'> | null;
  documents: Array<{ file: string; title: string; size: number }>;
}

/** Everything the public page may show — and nothing else. */
export async function buildShareView(link: ShareLink, rootPath?: string): Promise<ShareView | null> {
  const app = await getApplicationById(link.application_id, rootPath);
  if (!app) return null;
  const [history, checklist, artifacts] = await Promise.all([
    getStatusHistory(app.id, rootPath),
    readChecklist(app.id, rootPath),
    link.show_documents ? readArtifacts(app.id, rootPath) : null,
  ]);
  return {
    application_number: app.application_number,
    title: app.object_name || app.service_name || `Заявление № ${app.application_number}`,
    service_name: app.service_name,
    organization: app.organization,
    status: getMyGovStatus(app.status).label,
    status_type: getStatusType(app.acting_party, app.status),
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
