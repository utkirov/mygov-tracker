// App entry: expo-router plus the headless task that draws the home screen widget.
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './src/widget/task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
