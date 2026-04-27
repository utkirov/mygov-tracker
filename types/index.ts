// types/index.ts
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
  const terminalStatuses = ['одобрено', 'завершено', 'выдано', 'отказано'];
  if (terminalStatuses.some(s => status.toLowerCase().includes(s))) return 'completed';
  if (acting_party.toLowerCase().includes('заявитель')) return 'action_required';
  return 'in_progress';
}
