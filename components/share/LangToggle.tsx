'use client';

import { SHARE_LANG_COOKIE, type ShareLang } from '@/lib/share-i18n';
import { rememberShareChoice } from '@/lib/share-theme';

/** RU / UZ in the top bar of a share page: remembers the choice for a year and reloads the texts. */
export function LangToggle({ lang }: { lang: ShareLang }) {
  function choose(next: ShareLang) {
    if (next === lang) return;
    rememberShareChoice(SHARE_LANG_COOKIE, next);
    window.location.reload();
  }
  return (
    <span className="flex h-9 shrink-0 items-center rounded-full p-0.5 text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.10)' }}>
      {(['ru', 'uz'] as const).map(l => (
        <button key={l} type="button" onClick={() => choose(l)} aria-pressed={l === lang}
          className="h-8 rounded-full px-2.5 uppercase"
          style={l === lang ? { background: '#F3F1EC', color: '#0C0C0E' } : { color: '#F3F1EC' }}>
          {l}
        </button>
      ))}
    </span>
  );
}
