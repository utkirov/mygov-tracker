import { readChecklist } from './application-artifacts';
import type { Checklist } from './checklist';
import { loadClientIndex } from './clients';
import { listApplications, type LocalDbApplication } from './local-db';
import { canonicalService, isPersonalService } from './service-names';

/**
 * Terms and analytics from the history the tracker has already collected:
 * archived applications (submission → final status), the portal timeline of
 * every application (checklist.stages — when each stage started) and the
 * commissions' answers (checklist.orgs). Everything is computed on request —
 * a few hundred rows, no extra tables.
 *
 * All my.gov dates are Tashkent wall-clock time without an offset, so they are
 * compared as wall-clock values; «now» is shifted to the same clock.
 */

const DAY = 24 * 60 * 60 * 1000;
const TASHKENT_OFFSET = 5 * 60 * 60 * 1000;
/** A service or stage needs this many finished samples before we trust its median. */
const MIN_SAMPLES = 3;
/** An active application this old (and 3× past the usual term) is «stale», not just slow. */
const STALE_DAYS = 45;
/** A rejected object waits for a resubmission this long; after that it counts as dropped. */
const AWAITING_DAYS = 60;

export type Outcome = 'approved' | 'rejected' | 'cancelled' | 'active';

export interface DurationStats { n: number; median: number; p80: number; min: number; max: number }

export interface ServiceStats extends DurationStats {
  service: string;
  total: number;
  approved: number;
  rejected: number;
  cancelled: number;
  active: number;
  approvalRate: number | null;
}

export interface StageStats extends DurationStats { stage: string; actor: string }

export interface OrgStats {
  name: string;
  total: number;
  ok: number;
  bad: number;
  other: number;
  wait: number;
  rejectRate: number | null;
  /** Days from acceptance to the commission's answer. */
  response: DurationStats | null;
}

export interface Forecast {
  applicationId: string;
  application_number: string;
  title: string;
  service: string;
  elapsedDays: number;
  /** Typical total duration for this service (or all services when too few samples). */
  typicalDays: number | null;
  typicalBasis: 'service' | 'all' | null;
  expectedAt: string | null;
  stage: string;
  stageDays: number | null;
  stageTypicalDays: number | null;
  /** «slow» — this stage or the whole application already takes longer than 80% of past ones. */
  pace: 'on_track' | 'slow' | 'unknown';
  reason: string;
  /** Days past the expected date (null while still in time). */
  overdueDays: number | null;
  /** Long past every usual term — most likely abandoned, shown apart from the live ones. */
  stale: boolean;
}

/** An «object»: one application with all its resubmissions (the portal's chain). */
export interface ObjectTotals {
  total: number;
  approved: number;
  active: number;
  /** Last attempt rejected, nothing in work — waits for a new submission. */
  awaiting: number;
  /** Cancelled, or rejected long ago and never resubmitted. */
  dropped: number;
  approvalRate: number | null;
}

export interface AwaitingObject {
  applicationId: string;
  application_number: string;
  title: string;
  service: string;
  attempts: number;
  daysSinceRejection: number | null;
}

export interface AnalyticsOptions {
  /** Only applications submitted in the last N months (null — all time). */
  months?: number | null;
  /** Keep private errands (passport, benefits…) in the numbers. */
  includePersonal?: boolean;
}

export interface ClientStats {
  clientId: string;
  name: string;
  total: number;
  active: number;
  approved: number;
  rejected: number;
  cancelled: number;
  approvalRate: number | null;
  duration: DurationStats | null;
  slow: number;
}

export interface Analytics {
  generated_at: string;
  totals: {
    applications: number; finished: number; approved: number; rejected: number; cancelled: number; active: number;
    approvalRate: number | null;
    duration: DurationStats | null;
    approvedDuration: DurationStats | null;
    rejectedDuration: DurationStats | null;
  };
  services: ServiceStats[];
  stages: StageStats[];
  orgs: OrgStats[];
  rejections: { criteria: Array<{ label: string; count: number }>; orgs: Array<{ name: string; count: number }>; withResult: number };
  resubmissions: { chains: number; firstTimeApproved: number; approvedAfterRetry: number; avgAttemptsToApprove: number | null };
  months: Array<{ month: string; submitted: number; approved: number; rejected: number; cancelled: number; active: number }>;
  forecasts: Forecast[];
  clients: ClientStats[];
  coverage: { withTimeline: number; total: number };
  /** What the numbers cover (AnalyticsOptions) and how much was left out. */
  filter: { months: number | null; includePersonal: boolean; excludedPersonal: number; excludedOld: number };
  objects: ObjectTotals;
  /** Days from a rejection to the next submission of the same object — «our» time. */
  fixDays: DurationStats | null;
  awaiting: AwaitingObject[];
}

export function outcomeOf(status: string): Outcome {
  const s = status.toLowerCase();
  if (/обработан|выдан|исполнен|bajarildi|ko.rib chiqildi/.test(s)) return 'approved';
  if (/отклон|отказ|rad etil/.test(s)) return 'rejected';
  if (/аннулир|отозван|bekor/.test(s)) return 'cancelled';
  return 'active';
}

/** «2026-10-19 15:27:17», «2026-10-19T15:27:00», «19.10.2026 15:27» → wall-clock ms. */
export function wallTime(value: string | null | undefined): number | null {
  if (!value) return null;
  let m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
  return null;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function stats(values: number[]): DurationStats | null {
  const v = values.filter(x => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const r = (x: number) => Math.round(x * 10) / 10;
  return { n: v.length, median: r(quantile(v, 0.5)), p80: r(quantile(v, 0.8)), min: r(v[0]), max: r(v[v.length - 1]) };
}

const keyOf = (s: string) => s.toLowerCase().replace(/[ʼʻ‘’`´'"“”«»]/g, '').replace(/\s+/g, ' ').trim();
const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

/** Start and end of the application on the portal: timeline first, DB fields as a fallback. */
function span(app: LocalDbApplication, checklist: Checklist | null): { start: number | null; end: number | null } {
  const dates = (checklist?.stages ?? []).map(s => wallTime(s.date)).filter((x): x is number => x !== null);
  const start = wallTime(app.submission_date) ?? (dates.length ? Math.min(...dates) : null);
  const end = wallTime(app.last_changed_date) ?? (dates.length ? Math.max(...dates) : null);
  return { start, end };
}

/** Moment the commissions were asked: the acceptance stage, else the first stage. */
function acceptedAt(checklist: Checklist): number | null {
  const accepted = checklist.stages.find(s => /принят|qabul/i.test(s.title));
  return wallTime(accepted?.date ?? checklist.stages[0]?.date);
}

export interface Row { app: LocalDbApplication; checklist: Checklist | null; outcome: Outcome; client?: { id: string; name: string } | null }

export function computeAnalytics(rows: Row[], now = new Date()): Analytics {
  const nowWall = now.getTime() + TASHKENT_OFFSET;
  const finished = rows.filter(r => r.outcome !== 'active');
  const durationOf = (r: Row) => {
    const { start, end } = span(r.app, r.checklist);
    return start !== null && end !== null && end >= start ? (end - start) / DAY : NaN;
  };
  const decided = finished.filter(r => r.outcome !== 'cancelled');

  // Services: totals over all, durations over decided (approved/rejected) applications.
  const byService = new Map<string, Row[]>();
  for (const r of rows) {
    const k = canonicalService(r.app.service_name).key;
    byService.set(k, [...(byService.get(k) ?? []), r]);
  }
  const services: ServiceStats[] = [...byService.values()].map(list => {
    const count = (o: Outcome) => list.filter(r => r.outcome === o).length;
    const d = stats(list.filter(r => r.outcome === 'approved' || r.outcome === 'rejected').map(durationOf));
    return {
      service: canonicalService(list[0].app.service_name).label,
      total: list.length,
      approved: count('approved'), rejected: count('rejected'), cancelled: count('cancelled'), active: count('active'),
      approvalRate: rate(count('approved'), count('approved') + count('rejected')),
      ...(d ?? { n: 0, median: 0, p80: 0, min: 0, max: 0 }),
    };
  }).sort((a, b) => b.total - a.total);

  // Stages: how long the application waited after each timeline event until the next one.
  const stageSamples = new Map<string, { stage: string; actor: string; days: number[] }>();
  for (const r of rows) {
    const st = r.checklist?.stages ?? [];
    for (let i = 0; i < st.length - 1; i++) {
      const a = wallTime(st[i].date);
      const b = wallTime(st[i + 1].date);
      if (a === null || b === null || b < a) continue;
      const k = keyOf(st[i].title);
      const entry = stageSamples.get(k) ?? { stage: st[i].title, actor: st[i].actor, days: [] };
      if (!entry.actor && st[i].actor) entry.actor = st[i].actor;
      entry.days.push((b - a) / DAY);
      stageSamples.set(k, entry);
    }
  }
  const stages: StageStats[] = [...stageSamples.values()]
    .map(e => ({ stage: e.stage, actor: e.actor, ...stats(e.days)! }))
    .filter(s => s.n >= 2)
    .sort((a, b) => b.n - a.n || b.median - a.median);

  // Commissions: verdicts and response time.
  const orgMap = new Map<string, { name: string; ok: number; bad: number; other: number; wait: number; days: number[] }>();
  for (const r of rows) {
    if (!r.checklist) continue;
    const base = acceptedAt(r.checklist);
    for (const o of r.checklist.orgs) {
      const k = keyOf(o.name);
      const e = orgMap.get(k) ?? { name: o.name, ok: 0, bad: 0, other: 0, wait: 0, days: [] };
      e[o.status] += 1;
      const at = wallTime(o.date);
      if (o.status !== 'wait' && at !== null && base !== null && at >= base) e.days.push((at - base) / DAY);
      orgMap.set(k, e);
    }
  }
  const orgs: OrgStats[] = [...orgMap.values()].map(e => ({
    name: e.name,
    total: e.ok + e.bad + e.other + e.wait,
    ok: e.ok, bad: e.bad, other: e.other, wait: e.wait,
    rejectRate: rate(e.bad, e.ok + e.bad + e.other),
    response: stats(e.days),
  })).filter(o => o.ok + o.bad + o.other > 0).sort((a, b) => b.total - a.total);

  // Rejections: failed criteria of the final «Отказ» and the commissions that said no.
  const criteria = new Map<string, { label: string; count: number }>();
  const badOrgs = new Map<string, { name: string; count: number }>();
  let withResult = 0;
  for (const r of rows) {
    const res = r.checklist?.result;
    if (res?.kind !== 'rejected') continue;
    withResult += 1;
    for (const c of res.criteria.filter(c => c.status === 'bad')) {
      const k = keyOf(c.label);
      criteria.set(k, { label: c.label, count: (criteria.get(k)?.count ?? 0) + 1 });
    }
    for (const o of r.checklist!.orgs.filter(o => o.status === 'bad')) {
      const k = keyOf(o.name);
      badOrgs.set(k, { name: o.name, count: (badOrgs.get(k)?.count ?? 0) + 1 });
    }
  }

  // Resubmissions: the portal links every attempt (checklist.chain = earlier numbers + this one).
  const chainOf = new Map<string, string>();
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const numbers = [...(r.checklist?.chain ?? []), r.app.application_number].filter(Boolean);
    const root = numbers.map(n => chainOf.get(n)).find(Boolean) ?? numbers[0] ?? r.app.id;
    for (const n of numbers) chainOf.set(n, root);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  }
  let firstTimeApproved = 0;
  let approvedAfterRetry = 0;
  const attempts: number[] = [];
  for (const list of groups.values()) {
    const approved = list.find(r => r.outcome === 'approved');
    if (!approved) continue;
    const tries = Math.max(list.length, (approved.checklist?.chain.length ?? 0) || 1);
    attempts.push(tries);
    if (tries === 1) firstTimeApproved += 1; else approvedAfterRetry += 1;
  }

  // Objects: a chain of attempts counts once, by how it stands now.
  const objects: ObjectTotals = { total: groups.size, approved: 0, active: 0, awaiting: 0, dropped: 0, approvalRate: null };
  const fixSamples: number[] = [];
  const awaiting: AwaitingObject[] = [];
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => (span(a.app, a.checklist).start ?? 0) - (span(b.app, b.checklist).start ?? 0));
    for (let i = 0; i < ordered.length - 1; i++) {
      if (ordered[i].outcome !== 'rejected') continue;
      const end = span(ordered[i].app, ordered[i].checklist).end;
      const next = span(ordered[i + 1].app, ordered[i + 1].checklist).start;
      if (end !== null && next !== null && next >= end) fixSamples.push((next - end) / DAY);
    }
    const last = ordered[ordered.length - 1];
    if (ordered.some(r => r.outcome === 'approved')) objects.approved += 1;
    else if (ordered.some(r => r.outcome === 'active')) objects.active += 1;
    else {
      const end = span(last.app, last.checklist).end;
      const since = end !== null ? Math.max(0, (nowWall - end) / DAY) : null;
      if (last.outcome === 'rejected' && (since === null || since <= AWAITING_DAYS)) {
        objects.awaiting += 1;
        awaiting.push({
          applicationId: last.app.id,
          application_number: last.app.application_number,
          title: last.app.object_name || canonicalService(last.app.service_name).label,
          service: canonicalService(last.app.service_name).label,
          attempts: Math.max(ordered.length, last.checklist?.chain.length ?? 0, 1),
          daysSinceRejection: since === null ? null : Math.round(since * 10) / 10,
        });
      } else objects.dropped += 1;
    }
  }
  objects.approvalRate = rate(objects.approved, objects.approved + objects.awaiting + objects.dropped);
  awaiting.sort((a, b) => (a.daysSinceRejection ?? 0) - (b.daysSinceRejection ?? 0));

  // Months by submission date.
  const monthMap = new Map<string, Analytics['months'][number]>();
  for (const r of rows) {
    const start = span(r.app, r.checklist).start;
    if (start === null) continue;
    const month = new Date(start).toISOString().slice(0, 7);
    const m = monthMap.get(month) ?? { month, submitted: 0, approved: 0, rejected: 0, cancelled: 0, active: 0 };
    m.submitted += 1;
    m[r.outcome] += 1;
    monthMap.set(month, m);
  }

  // Forecasts for active applications.
  const allDecided = stats(decided.map(durationOf));
  const stageByKey = new Map(stages.map(s => [keyOf(s.stage), s]));
  const forecasts: Forecast[] = rows.filter(r => r.outcome === 'active').map((r): Forecast => {
    const { start } = span(r.app, r.checklist);
    const elapsedDays = start !== null ? Math.max(0, (nowWall - start) / DAY) : 0;
    const service = services.find(s => s.service === canonicalService(r.app.service_name).label);
    const basis: Forecast['typicalBasis'] = service && service.n >= MIN_SAMPLES ? 'service' : allDecided && allDecided.n >= MIN_SAMPLES ? 'all' : null;
    const typical = basis === 'service' ? service! : basis === 'all' ? allDecided! : null;
    const last = r.checklist?.stages.at(-1);
    const lastAt = wallTime(last?.date);
    const stageDays = lastAt !== null ? Math.max(0, (nowWall - lastAt) / DAY) : null;
    const stageStat = last ? stageByKey.get(keyOf(last.title)) : undefined;
    // A stage that past applications left within minutes (e.g. straight to the verdict) says nothing about the wait.
    const stageTypical = stageStat && stageStat.n >= MIN_SAMPLES && stageStat.median >= 0.1 ? stageStat : null;

    const reasons: string[] = [];
    if (stageTypical && stageDays !== null && stageDays > Math.max(stageTypical.p80, 1)) {
      reasons.push(`этап «${last!.title}» идёт ${fmtDays(stageDays)}, обычно ${fmtDays(stageTypical.median)}`);
    }
    if (typical && elapsedDays > Math.max(typical.p80, 1)) {
      reasons.push(`заявление идёт ${fmtDays(elapsedDays)}, обычно ${fmtDays(typical.median)}`);
    }
    const r1 = (x: number) => Math.round(x * 10) / 10;
    const overdue = typical ? elapsedDays - typical.p80 : null;
    return {
      overdueDays: overdue !== null && overdue > 0 ? r1(overdue) : null,
      stale: !!typical && elapsedDays > STALE_DAYS && elapsedDays > typical.p80 * 3,
      applicationId: r.app.id,
      application_number: r.app.application_number,
      title: r.app.object_name || r.app.service_name || r.app.application_number,
      service: r.app.service_name,
      elapsedDays: r1(elapsedDays),
      typicalDays: typical?.median ?? null,
      typicalBasis: basis,
      expectedAt: typical && start !== null ? new Date(start + typical.median * DAY - TASHKENT_OFFSET).toISOString() : null,
      stage: last?.title ?? r.app.current_action,
      stageDays: stageDays === null ? null : r1(stageDays),
      stageTypicalDays: stageTypical?.median ?? null,
      pace: reasons.length ? 'slow' : typical || stageTypical ? 'on_track' : 'unknown',
      reason: reasons.join('; '),
    };
  }).sort((a, b) => Number(a.stale) - Number(b.stale) || (a.pace === 'slow' ? 0 : 1) - (b.pace === 'slow' ? 0 : 1) || b.elapsedDays - a.elapsedDays);

  // Clients: the same numbers per client (lib/clients.ts assignments, resubmissions included).
  const slowIds = new Set(forecasts.filter(f => f.pace === 'slow').map(f => f.applicationId));
  const byClient = new Map<string, Row[]>();
  for (const r of rows) if (r.client) byClient.set(r.client.id, [...(byClient.get(r.client.id) ?? []), r]);
  const clients: ClientStats[] = [...byClient.values()].map(list => {
    const c = (o: Outcome) => list.filter(r => r.outcome === o).length;
    return {
      clientId: list[0].client!.id,
      name: list[0].client!.name,
      total: list.length,
      active: c('active'), approved: c('approved'), rejected: c('rejected'), cancelled: c('cancelled'),
      approvalRate: rate(c('approved'), c('approved') + c('rejected')),
      duration: stats(list.filter(r => r.outcome === 'approved' || r.outcome === 'rejected').map(durationOf)),
      slow: list.filter(r => slowIds.has(r.app.id)).length,
    };
  }).sort((a, b) => b.total - a.total);

  const count = (o: Outcome) => rows.filter(r => r.outcome === o).length;
  return {
    generated_at: now.toISOString(),
    totals: {
      applications: rows.length,
      finished: finished.length,
      approved: count('approved'), rejected: count('rejected'), cancelled: count('cancelled'), active: count('active'),
      approvalRate: rate(count('approved'), count('approved') + count('rejected')),
      duration: allDecided,
      approvedDuration: stats(rows.filter(r => r.outcome === 'approved').map(durationOf)),
      rejectedDuration: stats(rows.filter(r => r.outcome === 'rejected').map(durationOf)),
    },
    services,
    stages,
    orgs,
    rejections: {
      criteria: [...criteria.values()].sort((a, b) => b.count - a.count).slice(0, 15),
      orgs: [...badOrgs.values()].sort((a, b) => b.count - a.count).slice(0, 15),
      withResult,
    },
    resubmissions: {
      chains: groups.size,
      firstTimeApproved,
      approvedAfterRetry,
      avgAttemptsToApprove: attempts.length ? Math.round((attempts.reduce((a, b) => a + b, 0) / attempts.length) * 10) / 10 : null,
    },
    months: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    forecasts,
    clients,
    coverage: { withTimeline: rows.filter(r => (r.checklist?.stages.length ?? 0) > 1).length, total: rows.length },
    filter: { months: null, includePersonal: true, excludedPersonal: 0, excludedOld: 0 },
    objects,
    fixDays: stats(fixSamples),
    awaiting,
  };
}

/** The same numbers over a part of the history: a period and / or without private errands. */
export function filterRows(rows: Row[], options: AnalyticsOptions, now = new Date()): { rows: Row[]; filter: Analytics['filter'] } {
  const months = options.months ?? null;
  const includePersonal = options.includePersonal ?? true;
  const from = months ? now.getTime() + TASHKENT_OFFSET - months * 30.44 * DAY : null;
  let excludedPersonal = 0;
  let excludedOld = 0;
  const kept = rows.filter(r => {
    if (!includePersonal && isPersonalService(r.app.service_name)) { excludedPersonal += 1; return false; }
    if (from !== null) {
      const start = span(r.app, r.checklist).start;
      // Still in work — always shown, however old.
      if (start !== null && start < from && r.outcome !== 'active') { excludedOld += 1; return false; }
    }
    return true;
  });
  return { rows: kept, filter: { months, includePersonal, excludedPersonal, excludedOld } };
}

/** «5 ч», «1,5 дн», «12 дн». */
export function fmtDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} ч`;
  const v = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${String(v).replace('.', ',')} дн`;
}

let cache: { at: number; root: string | undefined; value: Analytics } | null = null;

/** Loads every application and its checklist; cached for a minute (the list API calls it too). */
export async function loadAnalytics(rootPath?: string, now = new Date(), options?: AnalyticsOptions): Promise<Analytics> {
  const plain = !options || ((options.months ?? null) === null && (options.includePersonal ?? true));
  if (plain && cache && cache.root === rootPath && now.getTime() - cache.at < 60_000) return cache.value;
  const apps = await listApplications({}, rootPath);
  const { byApplication } = await loadClientIndex(rootPath, apps);
  const rows: Row[] = await Promise.all(apps.map(async app => ({
    app,
    client: byApplication.get(app.id) ?? null,
    checklist: await readChecklist(app.id, rootPath),
    outcome: app.archived ? (outcomeOf(app.status) === 'active' ? 'cancelled' : outcomeOf(app.status)) : outcomeOf(app.status),
  })));
  if (!plain) {
    const part = filterRows(rows, options!, now);
    return { ...computeAnalytics(part.rows, now), filter: part.filter };
  }
  const value = computeAnalytics(rows, now);
  cache = { at: now.getTime(), root: rootPath, value };
  return value;
}

export function clearAnalyticsCache() { cache = null; }
