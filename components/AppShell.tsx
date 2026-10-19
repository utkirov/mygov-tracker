'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Archive, Keyboard, LayoutDashboard, Moon, Plus, RefreshCw, Search, Settings, Sun, X } from 'lucide-react';

import { useSyncEngineSnapshot, startSyncEngine, stopSyncEngine, requestImmediateSyncRun } from '@/lib/sync-engine';
import { showToast } from '@/lib/toast';
import { useTheme } from './ThemeProvider';
import { CommandPalette } from './CommandPalette';
import { NotificationsPanel } from './NotificationsPanel';

const NO_SHELL = ['/', '/login'];

const NAV = [
  { href: '/dashboard',  icon: LayoutDashboard, label: 'Доска' },
  { href: '/archive',    icon: Archive,          label: 'Архив' },
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
        className="w-full max-w-[320px] overflow-hidden rounded-[20px] animate-scale-in"
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
    showToast({ title: 'Проверка запущена', description: 'Очередь обходит все активные заявления.', tone: 'success' });
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

  if (NO_SHELL.includes(pathname)) {
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
        className="shell-glass sticky top-0 z-40 flex h-[60px] items-center gap-2 px-3 md:gap-3 md:px-6 relative"
        style={{ boxShadow: 'var(--shadow-topbar)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Gradient accent line at top */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
          style={{ background: 'linear-gradient(90deg, #3B6EFA 0%, #7C3AED 50%, #22D3EE 100%)' }}
        />

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-1 shrink-0">
          <div
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-[11px] font-black text-white"
            style={{ background: 'linear-gradient(135deg, #3B6EFA 0%, #7C3AED 100%)', boxShadow: '0 2px 8px rgba(59,110,250,0.4)' }}
          >
            MG
          </div>
          <span className="hidden text-[14px] font-bold text-white/85 sm:block tracking-tight">
            my.gov tracker
          </span>
        </Link>

        {/* ── Desktop nav ── */}
        <nav className="hidden md:flex items-center gap-0.5">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-[13px] font-medium transition-all duration-150"
                style={{
                  color:      active ? '#fff' : 'rgba(255,255,255,0.45)',
                  background: active ? 'linear-gradient(135deg, rgba(59,110,250,0.28) 0%, rgba(124,58,237,0.22) 100%)' : 'transparent',
                  boxShadow:  active ? 'inset 0 0 0 1px rgba(255,255,255,0.1)' : 'none',
                }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* ── Right side actions ── */}
        <div className="ml-auto flex items-center gap-1">
          {/* Sync status pill — desktop only */}
          <div
            className="hidden items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-medium md:flex"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{
                background: sync.isRunning ? '#FBBF24' : 'rgba(255,255,255,0.2)',
                animation: sync.isRunning ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
              }}
            />
            <span className="text-white/60 tabular">
              {sync.isRunning ? 'Проверяю…' : `${sync.intervalMinutes}м`}
            </span>
          </div>

          {/* Search / command palette — desktop */}
          <button
            onClick={() => setPaletteOpen(true)}
            aria-label="Поиск"
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-[9px] transition hover:bg-white/10 active:scale-90"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            title="Поиск (Ctrl+K)"
          >
            <Search size={14} />
          </button>

          {/* Shortcuts hint — desktop */}
          <button
            onClick={() => setShortcutsOpen(true)}
            aria-label="Горячие клавиши"
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-[9px] transition hover:bg-white/10 active:scale-90"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            title="Горячие клавиши (?)"
          >
            <Keyboard size={14} />
          </button>

          {/* Notifications */}
          <NotificationsPanel />

          {/* Add — desktop only */}
          <Link
            href="/add"
            className="hidden items-center gap-2 rounded-[9px] px-4 py-2 text-[13px] font-medium text-white/55 transition hover:bg-white/10 hover:text-white/85 active:scale-95 md:flex"
          >
            <Plus size={14} />
            <span>Добавить</span>
          </Link>

          {/* Check now */}
          <button
            onClick={handleCheckNow}
            disabled={sync.isRunning}
            aria-label={sync.isRunning ? 'Проверяю…' : 'Проверить'}
            className="flex items-center gap-2 rounded-[9px] px-4 py-2 text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #3B6EFA 0%, #7C3AED 100%)', boxShadow: '0 2px 10px rgba(59,110,250,0.35)' }}
          >
            <RefreshCw size={13} style={{ animation: sync.isRunning ? 'spin-slow 1s linear infinite' : 'none' }} />
            <span className="hidden sm:inline">{sync.isRunning ? 'Проверяю…' : 'Проверить'}</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="flex h-11 w-11 items-center justify-center rounded-[9px] text-white/35 transition hover:bg-white/10 hover:text-white/70 active:scale-90 md:h-9 md:w-9"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="min-h-[calc(100svh-60px)] pb-[68px] md:pb-0">
        {children}
      </main>

      {/* ── Mobile bottom navigation ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t md:hidden"
        style={{
          background:    'var(--shell)',
          borderColor:   'rgba(255,255,255,0.07)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-[3px] py-2.5 text-[10px] font-medium transition-colors active:scale-95"
              style={{ color: active ? 'var(--accent)' : 'rgba(255,255,255,0.35)' }}
            >
              <Icon size={17} strokeWidth={active ? 2.5 : 1.75} />
              {label}
            </Link>
          );
        })}
        <Link
          href="/add"
          className="flex flex-1 flex-col items-center gap-[3px] py-2.5 text-[10px] font-medium transition-colors active:scale-95"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          <Plus size={17} strokeWidth={1.75} />
          Добавить
        </Link>
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label="Поиск"
          className="flex flex-1 flex-col items-center gap-[3px] py-2.5 text-[10px] font-medium transition-colors active:scale-95"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          <Search size={17} strokeWidth={1.75} />
          Поиск
        </button>
      </nav>

      {/* ── Global overlays ── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
