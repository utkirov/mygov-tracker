import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { TrackerWidget } from './TrackerWidget';
import { loadWidgetData, WIDGET_NAME } from './widget-data';

/** Runs headless whenever Android asks the widget to draw (added, resized, every 30 min) or it's tapped. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== WIDGET_NAME) return;
  const height = props.widgetInfo.height;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(TrackerWidget({ data: await loadWidgetData(), heightDp: height }));
      break;
    case 'WIDGET_CLICK':
      if (props.clickAction === 'REFRESH') {
        const data = await loadWidgetData();
        props.renderWidget(TrackerWidget({ data, heightDp: height }));
      }
      break;
    default:
      break;
  }
}
