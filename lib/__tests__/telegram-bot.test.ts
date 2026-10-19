import type { LocalDbApplication, LocalDbStatusHistory } from '../local-db';
import { buildApplicationCardMessage, buildApplicationListKeyboard } from '../telegram-bot';

function makeApplication(overrides: Partial<LocalDbApplication> = {}): LocalDbApplication {
  return {
    id: 'app-1',
    application_number: '310365973',
    object_name: 'Тестовый <объект> & Ко',
    service_name: 'Согласование',
    organization: 'Министерство',
    status: 'В обработке',
    submission_date: null,
    last_changed_date: '2026-07-14T15:41:00',
    current_action: 'Заключение комиссии',
    acting_party: 'Заявитель',
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
    last_detected_change_at: null,
    last_change_summary: [],
    last_change_fields: [],
    created_at: '2026-06-16T16:21:00',
    updated_at: '2026-07-15T10:01:00',
    ...overrides,
  };
}

describe('buildApplicationListKeyboard', () => {
  it('builds one button per application with app:<id> callback_data, labeled with the title only (no number)', () => {
    const apps = [
      makeApplication({ id: 'a1', application_number: '111', object_name: 'Первый объект' }),
      makeApplication({ id: 'a2', application_number: '222', object_name: 'Второй объект' }),
    ];
    const keyboard = buildApplicationListKeyboard(apps);

    expect(keyboard.inline_keyboard).toHaveLength(2);
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe('app:a1');
    expect(keyboard.inline_keyboard[1][0].callback_data).toBe('app:a2');
    expect(keyboard.inline_keyboard[0][0].text).toBe('Первый объект');
    expect(keyboard.inline_keyboard[0][0].text).not.toContain('111');
  });

  it('falls back to the application number only when there is no title at all', () => {
    const apps = [makeApplication({ application_number: '333', object_name: '', service_name: '' })];
    const keyboard = buildApplicationListKeyboard(apps);
    expect(keyboard.inline_keyboard[0][0].text).toBe('Заявление 333');
  });

  it('truncates long titles so the button text stays reasonable', () => {
    const apps = [makeApplication({ object_name: 'A'.repeat(200) })];
    const keyboard = buildApplicationListKeyboard(apps);
    expect(keyboard.inline_keyboard[0][0].text.length).toBeLessThan(80);
  });
});

describe('buildApplicationCardMessage', () => {
  it('escapes HTML-significant characters from user-entered fields', () => {
    const message = buildApplicationCardMessage(makeApplication(), []);
    expect(message).toContain('&lt;объект&gt;');
    expect(message).toContain('&amp;');
    expect(message).not.toContain('<объект>');
  });

  it('includes the status, action, and acting party', () => {
    const message = buildApplicationCardMessage(makeApplication(), []);
    expect(message).toContain('В обработке');
    expect(message).toContain('Заключение комиссии');
    expect(message).toContain('Заявитель');
  });

  it('shows a placeholder when there is no history yet', () => {
    const message = buildApplicationCardMessage(makeApplication(), []);
    expect(message).toContain('История изменений пока пуста');
  });

  it('caps the displayed history at 8 entries (caller is responsible for sort order)', () => {
    const history: LocalDbStatusHistory[] = Array.from({ length: 10 }, (_, i) => ({
      id: `h${i}`,
      application_id: 'app-1',
      status: `Статус ${i}`,
      current_action: '',
      acting_party: '',
      recorded_at: `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00`,
    }));

    const message = buildApplicationCardMessage(makeApplication(), history);
    const historyLines = message.split('\n').filter((line) => line.startsWith('• '));
    expect(historyLines).toHaveLength(8);
  });
});
