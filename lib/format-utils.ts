import type { Application } from '@/types';

export function formatTimeAgo(value: string | null): string {
  if (!value) return '—';
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins}м`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}ч`;
  const days = Math.floor(hrs / 24);
  return `${days}д`;
}

/** "через 16 мин" / "через 2 ч" for a future timestamp; "сейчас" once it has passed. */
export function formatTimeUntil(value: string | null): string {
  if (!value) return '—';
  const mins = Math.ceil((new Date(value).getTime() - Date.now()) / 60_000);
  if (Number.isNaN(mins)) return '—';
  if (mins <= 0) return 'сейчас';
  if (mins < 60) return `через ${mins} мин`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `через ${hrs} ч` : `через ${Math.round(hrs / 24)} д`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

export function formatDate(value: string | null, options?: { long?: boolean }): string {
  if (!value) {
    return '—';
  }

  if (options?.long) {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function sectionTitle(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getChangeHeadline(application: Application): string {
  if (application.last_change_fields.includes('last_changed_date')) {
    return 'Обновилась дата последнего движения';
  }

  if (application.last_change_fields.includes('status')) {
    return 'Изменился статус';
  }

  if (application.last_change_fields.includes('acting_party')) {
    return 'Сменилась действующая сторона';
  }

  if (application.last_change_fields.includes('current_action')) {
    return 'Обновилось текущее действие';
  }

  return 'Зафиксировано новое изменение';
}
