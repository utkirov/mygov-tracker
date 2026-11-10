import { computeAnalytics, filterRows, fmtDays, outcomeOf, stats, wallTime } from '../analytics';
import { canonicalService, isPersonalService } from '../service-names';
import type { Checklist } from '../checklist';
import type { LocalDbApplication } from '../local-db';

const base: LocalDbApplication = {
  id: '', application_number: '', object_name: '', service_name: 'Согласование ПСД', organization: '', status: '',
  submission_date: null, last_changed_date: null, current_action: '', acting_party: '', verification_password: '',
  sms_phone: '', notes: '', pdf_filename: '', pdf_storage_key: null, project_id: null, parent_id: null, archived: false,
  sync_state: 'idle', last_checked_at: null, next_check_at: null, last_error: '', last_detected_change_at: null,
  last_change_summary: [], last_change_fields: [], created_at: '', updated_at: '',
};

function checklist(stages: Array<[string, string]>, extra: Partial<Checklist> = {}): Checklist {
  return {
    parsed_at: '', progress: [], outcome: null, orgs: [], counts: { ok: 0, bad: 0, other: 0, wait: 0, total: 0 },
    result: null, chain: [], correction: '',
    stages: stages.map(([title, date]) => ({ title, date, actor: '' })),
    ...extra,
  };
}

function finished(n: number, days: number, status: string) {
  const start = `2026-09-${String(n).padStart(2, '0')}T10:00:00`;
  const end = new Date(Date.UTC(2026, 8, n, 10) + days * 864e5).toISOString().slice(0, 19);
  return {
    app: { ...base, id: `f${n}`, application_number: `${100 + n}`, status, archived: true, submission_date: start, last_changed_date: end },
    checklist: checklist([['Принять на рассмотрение', start.replace('T', ' ')], ['Заключение комиссии', new Date(Date.UTC(2026, 8, n, 10) + 864e5).toISOString().slice(0, 19).replace('T', ' ')], ['Конец', end.replace('T', ' ')]]),
    outcome: outcomeOf(status),
  };
}

describe('analytics', () => {
  it('parses portal dates and statuses', () => {
    expect(wallTime('19.10.2026 15:27')).toBe(Date.UTC(2026, 9, 19, 15, 27));
    expect(wallTime('2026-10-19 15:27:17')).toBe(Date.UTC(2026, 9, 19, 15, 27, 17));
    expect(outcomeOf('Обработано')).toBe('approved');
    expect(outcomeOf('Отклонено')).toBe('rejected');
    expect(outcomeOf('Аннулировано')).toBe('cancelled');
    expect(outcomeOf('В обработке')).toBe('active');
    expect(stats([4, 1, 2, 3, 10])).toMatchObject({ n: 5, median: 3, min: 1, max: 10 });
    expect(fmtDays(0.2)).toBe('5 ч');
    expect(fmtDays(1.46)).toBe('1,5 дн');
  });

  it('computes service terms, stage durations and flags slow applications', () => {
    const rows = [
      finished(1, 8, 'Отклонено'), finished(2, 10, 'Обработано'), finished(3, 12, 'Отклонено'), finished(4, 9, 'Обработано'),
      {
        // 20 days in, 19 of them at «Заключение комиссии» (typically 1 day + the rest).
        app: { ...base, id: 'a1', application_number: '900', status: 'В обработке', submission_date: '2026-10-01T10:00:00' },
        checklist: checklist([['Принять на рассмотрение', '2026-10-01 10:00:00'], ['Заключение комиссии', '2026-10-02 10:00:00']]),
        outcome: 'active' as const,
      },
    ];
    const a = computeAnalytics(rows, new Date('2026-10-21T05:00:00Z')); // 10:00 Tashkent
    expect(a.totals).toMatchObject({ applications: 5, approved: 2, rejected: 2, active: 1, approvalRate: 50 });
    expect(a.services[0]).toMatchObject({ total: 5, n: 4, median: 9.5 });
    const commission = a.stages.find(s => s.stage === 'Заключение комиссии')!;
    expect(commission).toMatchObject({ n: 4, median: 8.5 });
    const f = a.forecasts[0];
    expect(f).toMatchObject({ applicationId: 'a1', elapsedDays: 20, typicalBasis: 'service', pace: 'slow', stageDays: 19 });
    expect(f.reason).toContain('Заключение комиссии');
  });

  it('counts approvals after resubmission through the portal chain', () => {
    const r1 = finished(1, 5, 'Отклонено');
    const r2 = finished(2, 5, 'Обработано');
    r2.checklist.chain = ['101', '102'];
    const a = computeAnalytics([r1, r2]);
    expect(a.resubmissions).toMatchObject({ chains: 1, firstTimeApproved: 0, approvedAfterRetry: 1, avgAttemptsToApprove: 2 });
  });
});

describe('analytics by object', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const attempt = (id: string, number: string, status: string, from: string, to: string, chain: string[] = [], service = 'Согласование ПСД') => ({
    app: { ...base, id, application_number: number, status, service_name: service, object_name: `Объект ${number}`, archived: outcomeOf(status) !== 'active', submission_date: from, last_changed_date: to },
    checklist: checklist([['Принять на рассмотрение', from.replace('T', ' ')], ['Конец', to.replace('T', ' ')]], { chain }),
    outcome: outcomeOf(status),
  });

  it('counts a chain of resubmissions as one object and measures the fix time', () => {
    const a = computeAnalytics([
      attempt('a1', '1', 'Отклонено', '2026-09-01T10:00:00', '2026-09-05T10:00:00'),
      attempt('a2', '2', 'Обработано', '2026-09-08T10:00:00', '2026-09-12T10:00:00', ['1', '2']),
      attempt('b1', '3', 'Отклонено', '2026-09-20T10:00:00', '2026-09-25T10:00:00'),
    ], now);
    expect(a.totals.approvalRate).toBe(33);
    expect(a.objects).toMatchObject({ total: 2, approved: 1, awaiting: 1, active: 0, approvalRate: 50 });
    expect(a.fixDays).toMatchObject({ n: 1, median: 3 });
    expect(a.awaiting.map(x => x.application_number)).toEqual(['3']);
  });

  it('merges one service filed in Russian and in Uzbek', () => {
    expect(canonicalService('Подача заявления на согласование проектно-сметной документации по городу Ташкент').key)
      .toBe(canonicalService("Toshkent shahri bo'yicha loyiha-smeta hujjatlarini kelishish uchun ariza berish").key);
    expect(canonicalService("Toshkent shahri bo'yicha loyiha-smeta hujjatlarining arxitektura qismini kelishish").key).toBe('psd-arch-tashkent');
    expect(canonicalService('Qurilish-montaj ishlarini boshlash uchun obyektga ruxsatnoma berish').key)
      .toBe(canonicalService('Выдача разрешения на объект для начала строительно-монтажных работ').key);
    expect(canonicalService('Что-то новое').label).toBe('Что-то новое');
    expect(isPersonalService('Подача заявления на оформление загранпаспорта')).toBe(true);
    expect(isPersonalService('Согласование ПСД')).toBe(false);
  });

  it('filters by period and private errands, keeping what is still in work', () => {
    const rows = [
      attempt('old', '1', 'Отклонено', '2026-01-01T10:00:00', '2026-01-05T10:00:00'),
      attempt('oldActive', '2', 'В обработке', '2026-01-01T10:00:00', '2026-01-05T10:00:00'),
      attempt('new', '3', 'Обработано', '2026-09-08T10:00:00', '2026-09-12T10:00:00'),
      attempt('mine', '4', 'Обработано', '2026-09-08T10:00:00', '2026-09-12T10:00:00', [], 'Получение свидетельства о рождении'),
    ];
    const part = filterRows(rows, { months: 3, includePersonal: false }, now);
    expect(part.rows.map(r => r.app.id)).toEqual(['oldActive', 'new']);
    expect(part.filter).toMatchObject({ excludedOld: 1, excludedPersonal: 1 });
  });
});
