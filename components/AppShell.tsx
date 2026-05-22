'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, LayoutDashboard, Moon, Plus, RefreshCw, Settings, Sun } from 'lucide-react';

import { useSyncEngineSnapshot, startSyncEngine, stopSyncEngine, requestImmediateSyncRun } from '@/lib/sync-engine';
import { showToast } from '@/lib/toast';
import { useTheme } from './ThemeProvider';

const NO_SHELL = ['/', '/login', '/register'];

const NAV = [
  { href: '/dashboard',  icon: LayoutDashboard, label: 'Доска' },
  { href: '/archive',    icon: Archive,          label: 'Архив' },
  { href: '/settings',   icon: Settings,         label: 'Настройки' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const { theme, toggle } = useTheme();
  const sync       = useSyncEngineSnapshot();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    startSyncEngine();
    return () => { stopSyncEngine(); };
  }, []);

  const handleCheckNow = useCallback(() => {
    if (checking) return;
    setChecking(true);
    requestImmediateSyncRun();
    showToast({ title: 'Проверка запущена', description: 'Очередь обходит все активные заявления.', tone: 'success' });
    setTimeout(() => setChecking(false), 4000);
  }, [checking]);

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
        className="shell-glass sticky top-0 z-40 flex h-[52px] items-center gap-2 px-3 md:gap-3 md:px-5"
        style={{ boxShadow: 'var(--shadow-topbar)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-1 shrink-0">
          <div
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-[10px] font-black text-white"
            style={{ background: 'var(--accent)' }}
          >
            MG
          </div>
          <span className="hidden text-[13px] font-semibold text-white/80 sm:block tracking-tight">
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
                className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-all"
                style={{
                  color:      active ? '#fff' : 'rgba(255,255,255,0.45)',
                  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* ── Right side actions ── */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Sync status pill — desktop only */}
          <div
            className="hidden items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-medium md:flex"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{
                background: checking
                  ? '#22C55E'
                  : sync.isRunning
                    ? '#FBBF24'
                    : 'rgba(255,255,255,0.2)',
                animation: (checking || sync.isRunning) ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
              }}
            />
            <span className="text-white/60 tabular">
              {checking ? 'Запускаю…' : sync.isRunning ? 'Проверяю…' : `${sync.intervalMinutes}м`}
            </span>
          </div>

          {/* Add — desktop only */}
          <Link
            href="/add"
            className="hidden items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80 md:flex"
          >
            <Plus size={13} />
            <span>Добавить</span>
          </Link>

          {/* Check now */}
          <button
            onClick={handleCheckNow}
            disabled={checking}
            className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            <RefreshCw size={12} style={{ animation: checking ? 'spin-slow 1s linear infinite' : 'none' }} />
            <span className="hidden sm:inline">{checking ? 'Проверяю…' : 'Проверить'}</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-white/35 transition hover:bg-white/10 hover:text-white/70"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="min-h-[calc(100svh-52px)] pb-[64px] md:pb-0">
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
      </nav>
    </div>
  );
}
