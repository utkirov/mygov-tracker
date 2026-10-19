// Generated from lucide-react (same icons as the website). Outline 24×24,
// stroke 2 — re-run the extractor in HANDOFF notes to add more.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const ICONS = {
  board: <><Rect width="7" height="9" x="3" y="3" rx="1" /><Rect width="7" height="5" x="14" y="3" rx="1" /><Rect width="7" height="9" x="14" y="12" rx="1" /><Rect width="7" height="5" x="3" y="16" rx="1" /></>,
  archive: <><Rect width="20" height="5" x="2" y="3" rx="1" /><Path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><Path d="M10 12h4" /></>,
  bell: <><Path d="M10.268 21a2 2 0 0 0 3.464 0" /><Path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></>,
  settings: <><Path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><Circle cx="12" cy="12" r="3" /></>,
  search: <><Path d="m21 21-4.34-4.34" /><Circle cx="11" cy="11" r="8" /></>,
  file: <><Path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><Path d="M14 2v5a1 1 0 0 0 1 1h5" /><Path d="M10 9H8" /><Path d="M16 13H8" /><Path d="M16 17H8" /></>,
  external: <><Path d="M15 3h6v6" /><Path d="M10 14 21 3" /><Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  offline: <><Path d="M12 20h.01" /><Path d="M8.5 16.429a5 5 0 0 1 7 0" /><Path d="M5 12.859a10 10 0 0 1 5.17-2.69" /><Path d="M19 12.859a10 10 0 0 0-2.007-1.523" /><Path d="M2 8.82a15 15 0 0 1 4.177-2.643" /><Path d="M22 8.82a15 15 0 0 0-11.288-3.764" /><Path d="m2 2 20 20" /></>,
  refresh: <><Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><Path d="M21 3v5h-5" /><Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><Path d="M8 16H3v5" /></>,
  chevron: <><Path d="m9 18 6-6-6-6" /></>,
  copy: <><Rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><Path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
  eye: <><Path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><Circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><Path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><Path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><Path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><Path d="m2 2 20 20" /></>,
  link: <><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  download: <><Path d="M12 15V3" /><Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><Path d="m7 10 5 5 5-5" /></>,
  alert: <><Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><Path d="M12 9v4" /><Path d="M12 17h.01" /></>,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color, strokeWidth = 2 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </Svg>
  );
}
