import { requestWidgetUpdate } from 'react-native-android-widget';

import { api, getToken, type Application } from '@/lib/api';
import { readCache } from '@/lib/cache';
import { statusType } from '@/lib/status';

import { TrackerWidget } from './TrackerWidget';

export const WIDGET_NAME = 'Tracker';

type StatusColor = 'new' | 'processing' | 'waiting' | 'done' | 'rejected' | 'canceled';

export interface WidgetData {
  waiting: number;
  active: number;
  items: Array<{ id: string; title: string; status: string; color: StatusColor }>;
  updatedLabel: string;
  offline: boolean;
  loading: boolean;
  signedOut: boolean;
}

const COLOR: Record<string, StatusColor> = {
  'новое': 'new',
  'в обработке': 'processing',
  'переотправлена': 'processing',
  'обработано': 'done',
  'отклонено': 'rejected',
  'аннулировано': 'canceled',
};

function toData(apps: Application[], savedAt: string | null, offline: boolean): WidgetData {
  const sorted = [...apps].sort((a, b) =>
    (b.last_detected_change_at ?? b.updated_at).localeCompare(a.last_detected_change_at ?? a.updated_at));
  // Applications waiting for the applicant first, then the most recently changed.
  const ordered = [...sorted.filter(a => statusType(a) === 'action_required'), ...sorted.filter(a => statusType(a) !== 'action_required')];
  const time = new Date(savedAt ?? Date.now());
  return {
    waiting: apps.filter(a => statusType(a) === 'action_required').length,
    active: apps.length,
    items: ordered.map(a => ({
      id: a.id,
      title: a.object_name || a.service_name || `№ ${a.application_number}`,
      status: a.status || '—',
      color: statusType(a) === 'action_required' ? 'waiting' : COLOR[a.status.trim().toLowerCase()] ?? 'processing',
    })),
    updatedLabel: time.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', ...(offline ? { day: '2-digit', month: '2-digit' } : {}) }),
    offline,
    loading: false,
    signedOut: false,
  };
}

const EMPTY: WidgetData = { waiting: 0, active: 0, items: [], updatedLabel: '—', offline: false, loading: false, signedOut: false };

/** Fresh data from the server, or the app's offline copy when the server can't be reached. */
export async function loadWidgetData(): Promise<WidgetData> {
  if (!(await getToken())) return { ...EMPTY, signedOut: true };
  try {
    const loaded = await api.applications(false);
    return toData(loaded.data, loaded.offlineSince, loaded.offlineSince !== null);
  } catch {
    const cached = await readCache<Application[]>('apps:false');
    return cached ? toData(cached.data, cached.savedAt, true) : { ...EMPTY, offline: true };
  }
}

/** Re-renders every placed widget — called after the app or the background task refreshed data. */
export async function refreshWidgets(data?: WidgetData): Promise<void> {
  try {
    const next = data ?? await loadWidgetData();
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: info => TrackerWidget({ data: next, heightDp: info.height }),
    });
  } catch {
    // No widget placed or widgets unsupported — nothing to do.
  }
}

export function widgetFromApplications(apps: Application[]): WidgetData {
  return toData(apps, null, false);
}
