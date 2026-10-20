import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildClientMessage } from '../client-notify';
import { clientApplications, createClient, listClients, resolveClientIds, setApplicationClient, suggestClients } from '../clients';
import { insertApplication, type LocalDbApplication } from '../local-db';
import {
  buildClientShareView,
  buildShareView,
  checkSharePin,
  createClientShareLink,
  createShareLink,
  deviceFromUserAgent,
  findShareLink,
  isShareLinkActive,
  isUnlocked,
  linkApplicationIds,
  listShareLinks,
  listShareViews,
  recordShareView,
  revokeShareLink,
  subscribeChat,
  subscribePayload,
  subscribersFor,
  unlockValue,
  unsubscribeChat,
} from '../share-links';
import { closeDb } from '../sqlite-db';

const APP: LocalDbApplication = {
  id: 'app-1', application_number: '360416823', object_name: 'Жилой дом', service_name: 'Согласование ПСД',
  organization: 'Минстрой', status: 'В обработке', submission_date: null, last_changed_date: null,
  current_action: 'Заключение комиссии', acting_party: 'Минстрой', verification_password: '33318',
  sms_phone: '998901234567', notes: 'внутренняя заметка', pdf_filename: 'z.pdf', pdf_storage_key: null,
  project_id: null, parent_id: null, archived: false, sync_state: 'idle', last_checked_at: null, next_check_at: null,
  last_error: '', last_detected_change_at: null, last_change_summary: [], last_change_fields: [],
  created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
};

describe('client share links', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'share-links-'));
    closeDb();
    await insertApplication(APP, root);
  });
  afterEach(async () => {
    closeDb();
    await rm(root, { recursive: true, force: true });
  });

  it('expires after the chosen time; "forever" links never do', async () => {
    const t0 = new Date('2026-10-20T10:00:00Z');
    const short = await createShareLink('app-1', { minutes: 30 }, root, t0);
    const forever = await createShareLink('app-1', { minutes: null }, root, t0);
    expect(isShareLinkActive(short, new Date('2026-10-20T10:29:00Z'))).toBe(true);
    expect(isShareLinkActive(short, new Date('2026-10-20T10:31:00Z'))).toBe(false);
    expect(isShareLinkActive(forever, new Date('2030-01-01T00:00:00Z'))).toBe(true);
    expect(short.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('rejects lifetimes outside the offered list and malformed PINs', async () => {
    await expect(createShareLink('app-1', { minutes: 5 }, root)).rejects.toThrow();
    await expect(createShareLink('app-1', { minutes: 60, pin: '12' }, root)).rejects.toThrow();
  });

  it('logs views once per device per 15 minutes; revoking stops the link', async () => {
    const link = await createShareLink('app-1', { minutes: 60, label: 'Заказчик' }, root);
    const ua = 'Mozilla/5.0 (Linux; Android 15) Telegram-Android/11';
    await recordShareView(link.token, ua, root, new Date('2026-10-20T10:00:00Z'));
    await recordShareView(link.token, ua, root, new Date('2026-10-20T10:05:00Z'));
    await recordShareView(link.token, 'Mozilla/5.0 (Windows NT 10.0)', root, new Date('2026-10-20T10:06:00Z'));
    expect((await findShareLink(link.token, root))!.views).toBe(2);
    expect((await listShareViews(link.token, 10, root)).map(v => v.device)).toEqual(['Windows', 'Android · Telegram']);
    expect(await revokeShareLink(link.token, root)).toBe(true);
    expect(isShareLinkActive((await findShareLink(link.token, root))!)).toBe(false);
    expect((await listShareLinks('app-1', root)).map(l => l.label)).toEqual(['Заказчик']);
    expect(await findShareLink('not-a-token', root)).toBeNull();
    expect(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe('iPhone');
  });

  it('never exposes the check password, phones, notes or the PDF', async () => {
    const link = await createShareLink('app-1', { minutes: 60, showDocuments: true }, root);
    const view = await buildShareView(link, root);
    const json = JSON.stringify(view);
    expect(view).toMatchObject({ application_number: '360416823', title: 'Жилой дом', status: 'В обработке' });
    for (const secret of ['33318', '998901234567', 'внутренняя заметка', 'z.pdf']) expect(json).not.toContain(secret);
  });

  it('PIN links need the PIN (rate-limited) and a signed subscribe payload', async () => {
    const link = await createShareLink('app-1', { minutes: 60, pin: '4821' }, root);
    expect(link.has_pin).toBe(true);
    expect(await isUnlocked(link.token, undefined, root)).toBe(false);
    expect(await checkSharePin(link.token, '0000', root, 1000)).toBe(false);
    expect(await checkSharePin(link.token, '4821', root, 2000)).toBe(true);
    expect(await isUnlocked(link.token, (await unlockValue(link.token, root))!, root)).toBe(true);
    for (let i = 0; i < 5; i++) await checkSharePin(link.token, '1111', root, 3000 + i);
    expect(await checkSharePin(link.token, '4821', root, 4000)).toBe('locked');

    expect(await subscribeChat(`s_${link.token}`, '777', root)).toBeNull();
    expect(await subscribeChat(await subscribePayload(link.token, root), '777', root)).not.toBeNull();
  });

  it('client links cover every application of the client, resubmissions included', async () => {
    await insertApplication({ ...APP, id: 'app-2', application_number: '370000001', parent_id: 'app-1', object_name: 'Жилой дом (повторно)' }, root);
    await insertApplication({ ...APP, id: 'app-3', application_number: '370000002', object_name: 'Чужой объект' }, root);
    const client = await createClient({ name: 'Mirabror aka', phone: '+998 90 000 00 00' }, root);
    await setApplicationClient('app-1', client.id, root);

    expect((await clientApplications(client.id, root)).map(a => a.id).sort()).toEqual(['app-1', 'app-2']);
    expect((await listClients(root))[0]).toMatchObject({ name: 'Mirabror aka', total: 2, active: 2 });

    const link = await createClientShareLink(client.id, { minutes: null }, root);
    const view = await buildClientShareView(link, root);
    expect(view!.client_name).toBe('Mirabror aka');
    expect(view!.applications.map(a => a.id).sort()).toEqual(['app-1', 'app-2']);
    expect(JSON.stringify(view)).not.toContain('+998 90');
    expect((await linkApplicationIds(link, root)).sort()).toEqual(['app-1', 'app-2']);

    // A chat subscribed to the client link hears about the resubmission too, until /stop.
    await subscribeChat(await subscribePayload(link.token, root), '555', root);
    expect((await subscribersFor('app-2', client.id, root)).map(s => s.chat_id)).toEqual(['555']);
    expect(await subscribersFor('app-3', null, root)).toEqual([]);
    await unsubscribeChat('555', root);
    expect(await subscribersFor('app-2', client.id, root)).toEqual([]);
  });
});

describe('clients helpers', () => {
  it('inherits the client through parent_id and suggests names from object names', () => {
    const apps = [{ id: 'a', parent_id: null }, { id: 'b', parent_id: 'a' }, { id: 'c', parent_id: 'b' }, { id: 'd', parent_id: null }];
    expect([...resolveClientIds(apps, new Map([['a', 'X']])).entries()]).toEqual([['a', 'X'], ['b', 'X'], ['c', 'X']]);
    const s = suggestClients([
      { id: '1', object_name: 'Mirabror aka uchastka' },
      { id: '2', object_name: "mirabror aka - 2 uchastka" },
      { id: '3', object_name: 'Yunusabad lot -1' },
      { id: '4', object_name: 'Shuxrat aka nejiloy' },
    ], new Set(['4']));
    expect(s).toEqual([{ name: 'Mirabror aka', applicationIds: ['1', '2'] }]);
  });

  it('client Telegram message shows stage and approvals, never secrets', () => {
    const text = buildClientMessage(
      { ...APP },
      { parsed_at: '', stages: [], progress: [{ title: 'Оплата', state: 'done', date: '2026-10-19 15:27:17' }, { title: 'Заключение комиссии', state: 'current', date: '2026-10-19 19:55:48' }], outcome: 'in_progress', orgs: [], counts: { ok: 7, bad: 0, other: 0, wait: 3, total: 10 }, result: null, chain: [], correction: '' },
      { statusChanged: false, actionChanged: false, completed: false, newVerdicts: 2 },
      'https://tracker.example/s/abc',
    );
    expect(text).toContain('Этап 2 из 2: Заключение комиссии');
    expect(text).toContain('Согласования: 7 из 10');
    for (const secret of ['33318', '998901234567', 'внутренняя']) expect(text).not.toContain(secret);
  });
});
