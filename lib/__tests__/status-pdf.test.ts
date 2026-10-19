import type { LocalDbApplication } from '../local-db';
import { buildStatusSnapshotPdf } from '../status-pdf';

const SAMPLE_APPLICATION: LocalDbApplication = {
  id: 'app-1',
  application_number: '310365973',
  object_name: 'Тестовый объект',
  service_name: 'Согласование проектно-сметной документации',
  organization: 'Министерство строительства',
  status: 'В обработке',
  submission_date: '2026-07-11T11:32:00',
  last_changed_date: '2026-07-14T15:41:00',
  current_action: 'Заключение комиссии',
  acting_party: 'Без действующей стороны',
  verification_password: '67324',
  sms_phone: '',
  notes: '',
  pdf_filename: '',
  pdf_storage_key: null,
  project_id: null,
  parent_id: null,
  archived: false,
  sync_state: 'success',
  last_checked_at: '2026-07-15T10:01:00',
  next_check_at: null,
  last_error: '',
  last_detected_change_at: '2026-07-14T15:50:00',
  last_change_summary: [],
  last_change_fields: [],
  created_at: '2026-06-16T16:21:00',
  updated_at: '2026-07-15T10:01:00',
};

describe('buildStatusSnapshotPdf', () => {
  it('produces a valid PDF with Cyrillic content when the system font is available, or returns null (not throw) otherwise', async () => {
    const result = await buildStatusSnapshotPdf({
      application: SAMPLE_APPLICATION,
      changedFields: ['status'],
      previousValues: { status: 'Новое', current_action: null, acting_party: null, last_changed_date: null },
      nextValues: { status: 'В обработке', current_action: null, acting_party: null, last_changed_date: null },
    });

    if (result === null) {
      // Best-effort artifact — acceptable on a runner without C:\Windows\Fonts\arial.ttf (e.g. Linux CI).
      return;
    }

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.length).toBeGreaterThan(500);
  });
});
