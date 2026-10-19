'use client';

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArrowRight, FileText, LayoutDashboard, Plus, Search, Settings } from 'lucide-react';
import type { Application } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const NAV = [
  { label: 'Доска',     href: '/dashboard', icon: LayoutDashboard, hint: 'D' },
  { label: 'Архив',     href: '/archive',   icon: Archive,          hint: 'A' },
  { label: 'Настройки', href: '/settings',  icon: Settings,         hint: 'S' },
  { label: 'Добавить',  href: '/add',       icon: Plus,             hint: 'N' },
];

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [apps, setApps] = useState<Application[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    startTransition(() => {
      setQuery('');
      setIdx(0);
    });
    fetch('/api/applications', { cache: 'no-store' })
      .then(r => r.json()).then(data => { if (Array.isArray(data)) setApps(data); }).catch(() => {});
    triggerRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      triggerRef.current?.focus();
    };
  }, [open]);

  // Trap Tab/Shift+Tab within the dialog while open
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const navItems = useMemo(() =>
    NAV.filter(c => !query || c.label.toLowerCase().includes(query.toLowerCase())),
    [query]);

  const appItems = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return apps.filter(a =>
      [a.application_number, a.object_name, a.service_name, a.organization]
        .join(' ').toLowerCase().includes(q)
    ).slice(0, 6);
  }, [apps, query]);

  const allItems = useMemo(() => [
    ...navItems.map(c => ({ type: 'nav' as const, nav: c })),
    ...appItems.map(a => ({ type: 'app' as const, app: a })),
  ], [navItems, appItems]);

  const go = useCallback((i: number) => {
    const item = allItems[i];
    if (!item) return;
    router.push(item.type === 'nav' ? item.nav.href : `/applications/${item.app.id}`);
    onClose();
  }, [allItems, router, onClose]);

  useEffect(() => { startTransition(() => setIdx(0)); }, [allItems.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, allItems.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter')     { e.preventDefault(); go(idx); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, idx, allItems.length, go, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: 'rgba(0,0,6,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Поиск"
        className="w-full max-w-[540px] overflow-hidden rounded-[12px] animate-scale-in"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-float)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: 'var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск заявлений и переходов…"
            aria-label="Поиск заявлений и переходов"
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-40"
            style={{ color: 'var(--text)' }}
          />
          <kbd className="flex items-center rounded-[5px] px-1.5 py-0.5 text-[11px]"
            style={{ background: 'var(--panel)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto p-2">
          {allItems.length === 0 && (
            <p className="py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Ничего не найдено
            </p>
          )}

          {navItems.length > 0 && (
            <>
              {!query && (
                <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold " style={{ color: 'var(--text-muted)' }}>
                  Навигация
                </p>
              )}
              {navItems.map((cmd, i) => {
                const active = idx === i;
                return (
                  <button key={cmd.href} onClick={() => { router.push(cmd.href); onClose(); }}
                    onMouseEnter={() => setIdx(i)}
                    className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors"
                    style={{ background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text)' }}
                  >
                    <cmd.icon size={15} style={{ flexShrink: 0, opacity: 0.75 }} />
                    <span className="flex-1 text-[13px] font-medium">{cmd.label}</span>
                    <kbd className="rounded-[4px] px-1.5 py-0.5 text-[11px]"
                      style={{ background: 'var(--panel)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {cmd.hint}
                    </kbd>
                  </button>
                );
              })}
            </>
          )}

          {appItems.length > 0 && (
            <>
              <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold " style={{ color: 'var(--text-muted)' }}>
                Заявления
              </p>
              {appItems.map((app, i) => {
                const itemIdx = navItems.length + i;
                const active = idx === itemIdx;
                return (
                  <button key={app.id} onClick={() => { router.push(`/applications/${app.id}`); onClose(); }}
                    onMouseEnter={() => setIdx(itemIdx)}
                    className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors"
                    style={{ background: active ? 'var(--accent-soft)' : 'transparent' }}
                  >
                    <FileText size={15} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold"
                        style={{ color: active ? 'var(--accent)' : 'var(--text)' }}>
                        {app.object_name || app.service_name}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        № {app.application_number} · {app.status}
                      </p>
                    </div>
                    <ArrowRight size={12} style={{ flexShrink: 0, color: 'var(--accent)', opacity: active ? 1 : 0 }} />
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t px-4 py-2" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>↑↓ выбор</span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Enter открыть</span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Esc закрыть</span>
        </div>
      </div>
    </div>
  );
}
