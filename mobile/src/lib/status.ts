import type { Theme } from './theme';

// Mirrors MY_GOV_STATUSES / getStatusType in the website's types/index.ts.
type Key = keyof Theme['status'];

const STATUSES: Record<string, { label: string; color: Key; type: StatusType }> = {
  'новое': { label: 'Новое', color: 'new', type: 'in_progress' },
  'в обработке': { label: 'В обработке', color: 'processing', type: 'in_progress' },
  'обработано': { label: 'Обработано', color: 'done', type: 'completed' },
  'отклонено': { label: 'Отклонено', color: 'rejected', type: 'completed' },
  'аннулировано': { label: 'Аннулировано', color: 'canceled', type: 'completed' },
  'переотправлена': { label: 'Переотправлена', color: 'processing', type: 'in_progress' },
  'черновик': { label: 'Черновик', color: 'canceled', type: 'in_progress' },
  'в ожидании другого заявителя': { label: 'В ожидании другого заявителя', color: 'waiting', type: 'action_required' },
  'в ожидании оплаты': { label: 'В ожидании оплаты', color: 'waiting', type: 'action_required' },
};

export type StatusType = 'in_progress' | 'action_required' | 'completed';

export function statusInfo(status: string, theme: Theme): { label: string; color: string; type: StatusType } {
  const s = STATUSES[status.trim().toLowerCase()];
  if (!s) return { label: status || '—', color: theme.status.canceled, type: 'in_progress' };
  return { label: s.label, color: theme.status[s.color], type: s.type };
}

export function statusType(app: { status: string; acting_party: string }): StatusType {
  const t = STATUSES[app.status.trim().toLowerCase()]?.type ?? 'in_progress';
  if (t !== 'in_progress') return t;
  const party = app.acting_party.toLowerCase();
  return party.includes('заявитель') || party.includes('ariza beruvchi') ? 'action_required' : 'in_progress';
}

export const CHANGE_FIELD_LABELS: Record<string, string> = {
  status: 'Статус',
  current_action: 'Текущее действие',
  acting_party: 'Действует',
  last_changed_date: 'Последнее изменение',
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
