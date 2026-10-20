'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Archive, Folder, Keyboard, LayoutDashboard, Moon, Plus, RefreshCw, Search, Settings, Sun, X } from 'lucide-react';

import { useSyncEngineSnapshot, startSyncEngine, stopSyncEngine, requestImmediateSyncRun } from '@/lib/sync-engine';
import { useTheme } from './ThemeProvider';
import { CommandPalette } from './CommandPalette';
import { NotificationsPanel } from './NotificationsPanel';

const NO_SHELL = ['/', '/login'];
/** Client share links (/s/<token>) — public pages, no tracker chrome or background polling. */
const isSharePage = (pathname: string) => pathname.startsWith('/s/');

const NAV = [
  { href: '/dashboard',  icon: LayoutDashboard, label: 'Доска' },
  { href: '/archive',    icon: Archive,          label: 'Архив' },
  { href: '/projects',   icon: Folder,           label: 'Проекты' },
  { href: '/settings',   icon: Settings,         label: 'Настройки' },
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'],  desc: 'Открыть поиск' },
  { keys: ['D'],           desc: 'Доска' },
  { keys: ['A'],           desc: 'Архив' },
  { keys: ['N'],           desc: 'Добавить' },
  { keys: ['S'],           desc: 'Настройки' },
  { keys: ['?'],           desc: 'Шорткаты' },
];

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the dialog on open, restore focus to the trigger on close
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => { trigger?.focus(); };
  }, []);

  // Trap Tab/Shift+Tab within the dialog
  useEffect(() => {
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
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,6,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-overlay-title"
        className="w-full max-w-[320px] overflow-hidden rounded-[12px] animate-scale-in"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-float)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <h2 id="shortcuts-overlay-title" className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Горячие клавиши</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] transition hover:bg-[var(--panel)] active:scale-90"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>
        <div className="divide-y p-2" style={{ borderColor: 'var(--border)' }}>
          {SHORTCUTS.map(s => (
            <div key={s.desc} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-[13px]" style={{ color: 'var(--text-soft)' }}>{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map(k => (
                  <kbd key={k} className="rounded-[5px] px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border-strong)' }}>
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t px-5 py-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Не работают внутри полей ввода
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { theme, toggle } = useTheme();
  const sync     = useSyncEngineSnapshot();
  const [paletteOpen,    setPaletteOpen]    = useState(false);
  const [shortcutsOpen,  setShortcutsOpen]  = useState(false);

  useEffect(() => {
    if (isSharePage(window.location.pathname)) return;
    startSyncEngine();
    return () => { stopSyncEngine(); };
  }, []);

  // background-server.mjs auto-opens the browser at `?token=...`. The
  // app_token cookie itself is minted by proxy.ts on the very first
  // request (before any React code runs), so by the time this component
  // mounts the browser is already authenticated — this effect only tidies
  // the token out of the visible URL/history.
  useEffect(() => {
    if (!window.location.search.includes('token=')) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('token');
    const nextSearch = params.toString();
    router.replace(`${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
  }, [router]);

  const handleCheckNow = useCallback(() => {
    if (sync.isRunning) return;
    requestImmediateSyncRun();
  }, [sync.isRunning]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K → palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
        return;
      }
      // Esc → close overlays
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setShortcutsOpen(false);
        return;
      }
      // Skip if focus is in an input
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement).isContentEditable) return;
      // Skip if any overlay is open
      if (paletteOpen || shortcutsOpen) return;

      if (e.key === '?')               { setShortcutsOpen(true);  return; }
      if (e.key === 'd' || e.key === 'D') { router.push('/dashboard'); return; }
      if (e.key === 'a' || e.key === 'A') { router.push('/archive');   return; }
      if (e.key === 'n' || e.key === 'N') { router.push('/add');        return; }
      if (e.key === 's' || e.key === 'S') { router.push('/settings');   return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paletteOpen, shortcutsOpen, router]);

  if (NO_SHELL.includes(pathname) || isSharePage(pathname)) {
    return <>{children}</>;
  }

  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === href || pathname.startsWith('/applications')
      : pathname.startsWith(href);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100svh' }}>
      {/* ── Top bar ── */}
      <header
        className="shell-glass sticky top-0 z-40 flex h-[56px] items-center gap-2 px-3 md:gap-3 md:px-6"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Link href="/dashboard" className="mr-2 flex shrink-0 items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[12px] font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
          >
            mg
          </div>
          <span className="hidden text-[14px] font-semibold tracking-tight sm:block" style={{ color: 'var(--text)' }}>
            my.gov tracker
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--panel)]"
                style={{ color: active ? 'var(--text)' : 'var(--text-muted)', background: active ? 'var(--panel)' : 'transparent' }}
              >
                <Icon size={15} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <div
            className="hidden items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] md:flex"
            style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}
            title={sync.isRunning ? 'Идёт цикл проверки' : `Автопроверка каждые ${sync.intervalMinutes} мин`}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: sync.isRunning ? 'var(--warning)' : sync.enabled ? 'var(--success)' : 'var(--text-muted)',
                animation: sync.isRunning ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
              }}
            />
            <span className="tabular">{sync.isRunning ? 'Проверяю…' : `Авто · ${sync.intervalMinutes} мин`}</span>
          </div>

          <button onClick={() => setPaletteOpen(true)} aria-label="Поиск" title="Поиск (Ctrl+K)"
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-[8px] transition hover:bg-[var(--panel)] active:scale-95" style={{ color: 'var(--text-muted)' }}>
            <Search size={15} />
          </button>

          <button onClick={() => setShortcutsOpen(true)} aria-label="Горячие клавиши" title="Горячие клавиши (?)"
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-[8px] transition hover:bg-[var(--panel)] active:scale-95" style={{ color: 'var(--text-muted)' }}>
            <Keyboard size={15} />
          </button>

          <NotificationsPanel />

          <Link
            href="/add"
            className="hidden items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--panel)] md:flex"
            style={{ color: pathname === '/add' ? 'var(--text)' : 'var(--text-soft)', background: pathname === '/add' ? 'var(--panel)' : 'transparent' }}
          >
            <Plus size={15} />
            <span>Добавить</span>
          </Link>

          <button
            onClick={handleCheckNow}
            disabled={sync.isRunning}
            aria-label={sync.isRunning ? 'Проверяю…' : 'Проверить все'}
            className="flex items-center gap-2 rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium transition hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
          >
            <RefreshCw size={14} style={{ animation: sync.isRunning ? 'spin-slow 1s linear infinite' : 'none' }} />
            <span className="hidden sm:inline">{sync.isRunning ? 'Проверяю…' : 'Проверить все'}</span>
          </button>

          <button
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="flex h-10 w-10 items-center justify-center rounded-[8px] transition hover:bg-[var(--panel)] active:scale-95 md:h-9 md:w-9"
            style={{ color: 'var(--text-muted)' }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <main className="min-h-[calc(100svh-56px)] pb-[68px] md:pb-0">
        {children}
      </main>

      {/* ── Mobile bottom navigation ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t md:hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-[3px] py-2.5 text-[11px] font-medium transition-colors active:scale-95"
              style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}
            >
              <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
              {label}
            </Link>
          );
        })}
        <Link
          href="/add"
          className="flex flex-1 flex-col items-center gap-[3px] py-2.5 text-[11px] font-medium transition-colors active:scale-95"
          style={{ color: pathname === '/add' ? 'var(--text)' : 'var(--text-muted)' }}
        >
          <Plus size={18} strokeWidth={1.75} />
          Добавить
        </Link>
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label="Поиск"
          className="flex flex-1 flex-col items-center gap-[3px] py-2.5 text-[11px] font-medium transition-colors active:scale-95"
          style={{ color: 'var(--text-muted)' }}
        >
          <Search size={18} strokeWidth={1.75} />
          Поиск
        </button>
      </nav>

      {/* ── Global overlays ── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
