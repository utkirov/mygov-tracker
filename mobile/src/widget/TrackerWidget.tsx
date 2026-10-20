import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { WidgetData } from './widget-data';

type Hex = `#${string}`;

interface Palette {
  bg: Hex; text: Hex; soft: Hex; muted: Hex; panel: Hex; danger: Hex; accent: Hex;
  status: Record<'new' | 'processing' | 'waiting' | 'done' | 'rejected' | 'canceled', Hex>;
}

// Same tokens as lib/theme.ts — the widget runs outside React Native views,
// so it can't read the theme hook.
const LIGHT: Palette = {
  bg: '#FFFFFF', text: '#0B0B0D', soft: '#52525B', muted: '#8B8B94', panel: '#F2F2F4', danger: '#DC2626', accent: '#2563EB',
  status: { new: '#2563EB', processing: '#D97706', waiting: '#DC2626', done: '#16A34A', rejected: '#BE123C', canceled: '#71717A' },
};
const DARK: Palette = {
  bg: '#141416', text: '#F4F4F5', soft: '#A1A1AA', muted: '#71717A', panel: '#1C1C1F', danger: '#F87171', accent: '#60A5FA',
  status: { new: '#60A5FA', processing: '#FBBF24', waiting: '#F87171', done: '#4ADE80', rejected: '#FB7185', canceled: '#A1A1AA' },
};

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function TrackerWidgetView({ data, p, rows }: { data: WidgetData; p: Palette; rows: number }) {
  const waiting = data.waiting;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.bg, borderRadius: 20, padding: 14, flexDirection: 'column' }}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextWidget text="my.gov tracker" style={{ fontSize: 13, color: p.soft, fontWeight: '600' }} />
        <FlexWidget clickAction="REFRESH" style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: p.panel }}>
          <TextWidget text={data.loading ? '…' : '↻ Обновить'} style={{ fontSize: 12, color: p.accent }} />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'mygovtracker:///' }} style={{ marginTop: 8, flexDirection: 'column' }}>
        <TextWidget
          text={waiting > 0 ? `${waiting} ${plural(waiting, 'ждёт', 'ждут', 'ждут')} вашего действия` : 'Действий не требуется'}
          style={{ fontSize: 17, color: waiting > 0 ? p.danger : p.text, fontWeight: '700' }}
        />
        <TextWidget
          text={`${data.active} активных · ${data.offline ? 'нет связи, данные на ' : 'обновлено '}${data.updatedLabel}`}
          style={{ fontSize: 12, color: p.muted, marginTop: 2 }}
        />
      </FlexWidget>

      <FlexWidget style={{ marginTop: 8, flexDirection: 'column', width: 'match_parent' }}>
        {data.items.slice(0, rows).map(item => (
          <FlexWidget
            key={item.id}
            clickAction="OPEN_URI"
            clickActionData={{ uri: `mygovtracker:///application/${item.id}` }}
            style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}
          >
            <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.status[item.color], marginRight: 8 }} />
            <FlexWidget style={{ flex: 1 }}>
              <TextWidget text={item.title} maxLines={1} truncate="END" style={{ fontSize: 13, color: p.text }} />
            </FlexWidget>
            <TextWidget text={item.status} maxLines={1} style={{ fontSize: 12, color: p.muted, marginLeft: 8 }} />
          </FlexWidget>
        ))}
        {data.items.length === 0 && !data.loading && (
          <TextWidget text={data.signedOut ? 'Войдите в приложение' : 'Заявлений нет'} style={{ fontSize: 12, color: p.muted }} />
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

/** Light + dark variants; the launcher picks by system theme. Rows depend on widget height. */
export function TrackerWidget({ data, heightDp }: { data: WidgetData; heightDp: number }) {
  const rows = heightDp >= 250 ? 6 : heightDp >= 180 ? 4 : heightDp >= 140 ? 2 : 1;
  return { light: <TrackerWidgetView data={data} p={LIGHT} rows={rows} />, dark: <TrackerWidgetView data={data} p={DARK} rows={rows} /> };
}
