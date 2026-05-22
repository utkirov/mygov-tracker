import type { Application } from '@/types';

export function formatTimeAgo(value: string | null): string {
  if (!value) return '—';
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  return `${days} д назад`;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return '—';
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
