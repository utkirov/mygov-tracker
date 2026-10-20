import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { insertApplication, type LocalDbApplication } from '../local-db';
import {
  buildShareView,
  createShareLink,
  findShareLink,
  isShareLinkActive,
  listShareLinks,
  revokeShareLink,
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

  it('rejects lifetimes outside the offered list', async () => {
    await expect(createShareLink('app-1', { minutes: 5 }, root)).rejects.toThrow();
  });

  it('revoking stops the link and counts only active views', async () => {
    const link = await createShareLink('app-1', { minutes: 60, label: 'Заказчик' }, root);
    expect((await findShareLink(link.token, { countView: true }, root))!.views).toBe(1);
    expect(await revokeShareLink(link.token, root)).toBe(true);
    const after = await findShareLink(link.token, { countView: true }, root);
    expect(isShareLinkActive(after!)).toBe(false);
    expect(after!.views).toBe(1);
    expect((await listShareLinks('app-1', root)).map(l => l.label)).toEqual(['Заказчик']);
    expect(await findShareLink('not-a-token', {}, root)).toBeNull();
  });

  it('never exposes the check password, phones, notes or the PDF', async () => {
    const link = await createShareLink('app-1', { minutes: 60, showDocuments: true }, root);
    const view = await buildShareView(link, root);
    const json = JSON.stringify(view);
    expect(view).toMatchObject({ application_number: '360416823', title: 'Жилой дом', status: 'В обработке' });
    for (const secret of ['33318', '998901234567', 'внутренняя заметка', 'z.pdf']) expect(json).not.toContain(secret);
  });
});
