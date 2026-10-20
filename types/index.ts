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
  parent_id: string | null;
  archived: boolean;
  /** Number of stored result documents — only sent by the archive list. */
  result_documents?: number;
  /** Approvals progress for cards — sent by the list API. */
  checklist_summary?: ChecklistSummary | null;
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
  // Solid hex color for standalone status-dot indicators (e.g. compact widgets
  // where a badge's pastel background/text pairing wouldn't read as a dot)
  dotColor: string;
}

const STATUS_MAP: Record<string, MyGovStatus> = {
  'новое': {
    label: 'Новое',
    type: 'in_progress',
    badge: 'text-[color:var(--text)]',
    dotColor: 'var(--col-new)',
  },
  'в обработке': {
    label: 'В обработке',
    type: 'in_progress',
    badge: 'text-[color:var(--text)]',
    dotColor: 'var(--col-processing)',
  },
  'обработано': {
    label: 'Обработано',
    type: 'completed',
    badge: 'text-[color:var(--text)]',
    dotColor: 'var(--col-done)',
  },
  'отклонено': {
    label: 'Отклонено',
    type: 'completed',
    badge: 'text-[color:var(--text)]',
    dotColor: 'var(--col-rejected)',
  },
  'аннулировано': {
    label: 'Аннулировано',
    type: 'completed',
    badge: 'text-[color:var(--text)]',
    dotColor: 'var(--col-canceled)',
  },
  'переотправлена': {
    label: 'Переотправлена',
    type: 'in_progress',
    badge: 'text-[color:var(--text)]',
    dotColor: 'var(--col-processing)',
  },
  'черновик': {
    label: 'Черновик',
    type: 'in_progress',
    badge: 'text-[color:var(--text)]',
    dotColor: 'var(--col-canceled)',
  },
  'в ожидании другого заявителя': {
    label: 'В ожидании другого заявителя',
    type: 'action_required',
    badge: 'text-[color:var(--text)]',
    dotColor: 'var(--col-waiting)',
  },
  'в ожидании оплаты': {
    label: 'В ожидании оплаты',
    type: 'action_required',
    badge: 'text-[color:var(--text)]',
    dotColor: 'var(--col-waiting)',
  },
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

export function getMyGovStatus(status: string): MyGovStatus {
  return STATUS_MAP[normalizeStatus(status)] ?? {
    label: status,
    type: 'in_progress' as StatusType,
    badge: 'text-[color:var(--text-soft)]',
    dotColor: 'var(--text-soft)',
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

/** Files a status check stored for an application (see lib/application-artifacts.ts). */
export interface ArtifactFile {
  file: string;
  size: number;
  saved_at: string;
}

export interface ResultDocument extends ArtifactFile {
  title: string;
  state: string;
  pin: string;
}

export interface ApplicationArtifacts {
  screenshot: ArtifactFile | null;
  status_pdf: ArtifactFile | null;
  results: ResultDocument[];
}

/** Approvals checklist (lib/checklist.ts) — mirrored for the client. */
export type ApprovalStatus = 'ok' | 'bad' | 'other' | 'wait';
export interface ChecklistOrg { name: string; status: ApprovalStatus; verdict: string; comment: string; date: string; num: number | null }
export interface ChecklistCriterion { label: string; value: string; status: ApprovalStatus }
export interface Checklist {
  parsed_at: string;
  stages: Array<{ title: string; date: string; actor: string }>;
  orgs: ChecklistOrg[];
  counts: Record<ApprovalStatus, number> & { total: number };
  result: {
    kind: 'rejected' | 'approved';
    stage: string;
    date: string;
    actor: string;
    number: string;
    conclusionDate: string;
    criteria: ChecklistCriterion[];
    texts: Array<{ label: string; text: string }>;
  } | null;
  chain: string[];
  correction: string;
}
export interface ChecklistSummary extends Record<ApprovalStatus, number> { total: number; result: 'rejected' | 'approved' | null; failed: number }
