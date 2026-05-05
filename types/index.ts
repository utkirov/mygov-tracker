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

export function getStatusType(acting_party: string, status: string): StatusType {
  const terminalStatuses = ['одобрено', 'завершено', 'выдано', 'отказано', 'tasdiqlangan', 'bekor'];
  if (terminalStatuses.some(s => status.toLowerCase().includes(s))) return 'completed';
  if (acting_party.toLowerCase().includes('заявитель') || acting_party.toLowerCase().includes('ariza beruvchi')) return 'action_required';
  return 'in_progress';
}

export const PROJECT_COLORS = [
  '#0071e3', '#34c759', '#ff9500', '#ff3b30',
  '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00',
];
