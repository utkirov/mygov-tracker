'use client';

import { Moon, Sun } from 'lucide-react';

import { SHARE_THEME_COOKIE } from '@/lib/share-theme';

/**
 * Sun / moon in the top bar of a share page: flips light ↔ dark and remembers
 * it for a year (cookie, so the server renders the chosen colours). Which icon
 * shows is decided by CSS from the theme class on #share-root.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.getElementById('share-root');
    if (!root) return;
    const dark = root.classList.contains('share-theme-dark')
      || (root.classList.contains('share-theme-auto') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    root.classList.remove('share-theme-light', 'share-theme-dark', 'share-theme-auto');
    root.classList.add(`share-theme-${next}`);
    document.cookie = `${SHARE_THEME_COOKIE}=${next}; path=/s; max-age=31536000; samesite=lax`;
  }

  return (
    <button type="button" onClick={toggle} aria-label="Переключить светлую и тёмную тему" title="Светлая / тёмная тема"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ background: 'rgba(255,255,255,0.10)', color: '#F3F1EC' }}>
      <Sun size={17} className="share-icon-sun" />
      <Moon size={17} className="share-icon-moon" />
    </button>
  );
}
