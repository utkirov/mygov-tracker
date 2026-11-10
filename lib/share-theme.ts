/**
 * Light / dark theme of the public share page /s/<…>. The visitor switches it
 * with the icon in the top bar (components/share/ThemeToggle.tsx); the choice
 * lives in a cookie so the server renders the right colours straight away.
 * Without a choice the page follows the device theme («auto»).
 */
export type ShareTheme = 'light' | 'dark' | 'auto';

export const SHARE_THEME_COOKIE = 'share_theme';

export function parseShareTheme(value: unknown): ShareTheme {
  return value === 'light' || value === 'dark' ? value : 'auto';
}
