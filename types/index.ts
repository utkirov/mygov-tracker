// types/index.ts
export type SyncState = 'idle' | 'queued' | 'checking' | 'success' | 'error';
export type ApplicationChangeField =
  | 'status'
  | 'current_action'
  | 'acting_party'
  | 'last_changed_date';

export interface Project {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Application {
  id: string;
  application_number: string;
  object_name: string;
  service_name: string;
  organization: string;
  status: string;
  submission_date: string | null;
  last_changed_date: string | null;
  current_action: string;
  acting_party: string;
  verification_password: string;
  sms_phone: string;
  notes: string;
  pdf_filename: string;
  pdf_storage_key: string | null;
  project_id: string | null;
  archived: boolean;
  sync_state: SyncState;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_error: string;
  last_detected_change_at: string | null;
  last_change_summary: string[];
  last_change_fields: ApplicationChangeField[];
  created_at: string;
  updated_at: string;
}

export interface StatusHistory {
  id: string;
  application_id: string;
  status: string;
  current_action: string;
  acting_party: string;
  recorded_at: string;
}

export interface ParsedPdf {
  application_number: string;
  service_name: string;
  organization: string;
  status: string;
  submission_date: string;
  last_changed_date: string;
  current_action: string;
  acting_party: string;
  verification_password: string;
  sms_phone: string;
}

export type StatusType = 'action_required' | 'in_progress' | 'completed';

// Official my.gov.uz statuses
export interface MyGovStatus {
  label: string;
  type: StatusType;
  // Tailwind classes for the badge
  badge: string;
}

const STATUS_MAP: Record<string, MyGovStatus> = {
  'новое': {
    label: 'Новое',
    type: 'in_progress',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-400/20 dark:text-orange-200',
  },
  'в обработке': {
    label: 'В обработке',
    type: 'in_progress',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200',
  },
  'обработано': {
    label: 'Обработано',
    type: 'completed',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200',
  },
  'отклонено': {
    label: 'Отклонено',
    type: 'completed',
    badge: 'bg-red-100 text-red-800 dark:bg-red-400/20 dark:text-red-200',
  },
  'аннулировано': {
    label: 'Аннулировано',
    type: 'completed',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-400/20 dark:text-gray-300',
  },
  'переотправлена': {
    label: 'Переотправлена',
    type: 'in_progress',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-400/20 dark:text-orange-200',
  },
  'черновик': {
    label: 'Черновик',
    type: 'in_progress',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-400/20 dark:text-yellow-200',
  },
  'в ожидании другого заявителя': {
    label: 'В ожидании другого заявителя',
    type: 'action_required',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-400/20 dark:text-orange-200',
  },
  'в ожидании оплаты': {
    label: 'В ожидании оплаты',
    type: 'action_required',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-400/20 dark:text-blue-200',
  },
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

export function getMyGovStatus(status: string): MyGovStatus {
  return STATUS_MAP[normalizeStatus(status)] ?? {
    label: status,
    type: 'in_progress' as StatusType,
    badge: 'bg-[var(--panel-strong)] text-[var(--text-soft)]',
  };
}

export function isCompletedStatus(status: string): boolean {
  return getMyGovStatus(status).type === 'completed';
}

export function getStatusType(acting_party: string, status: string): StatusType {
  const mygovType = getMyGovStatus(status).type;
  if (mygovType === 'completed') return 'completed';
  // action_required from status map takes precedence
  if (mygovType === 'action_required') return 'action_required';
  // fallback: check acting_party for заявитель
  const party = acting_party.toLowerCase();
  if (party.includes('заявитель') || party.includes('ariza beruvchi')) return 'action_required';
  return 'in_progress';
}

export function isApplicationCheckable(input: Pick<Application, 'acting_party' | 'status' | 'archived'>): boolean {
  return !input.archived && getStatusType(input.acting_party, input.status) !== 'completed';
}

export function getApplicationChangeFieldLabel(field: ApplicationChangeField): string {
  switch (field) {
    case 'status':
      return 'Статус';
    case 'current_action':
      return 'Текущее действие';
    case 'acting_party':
      return 'Действует';
    case 'last_changed_date':
      return 'Последнее изменение';
    default:
      return field;
  }
}

export const PROJECT_COLORS = [
  '#0071e3', '#34c759', '#ff9500', '#ff3b30',
  '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00',
];
