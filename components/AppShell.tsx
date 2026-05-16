'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive,
  LayoutDashboard,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Sun,
} from 'lucide-react';

import { useSyncEngineSnapshot, startSyncEngine, stopSyncEngine } from '@/lib/sync-engine';

import { useTheme } from './ThemeProvider';

const NO_SHELL = ['/', '/login', '/register'];

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Мониторинг' },
  { href: '/archive', icon: Archive, label: 'Архив' },
  { href: '/settings', icon: Settings, label: 'Настройки' },
];

function formatSyncTime(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const sync = useSyncEngineSnapshot();

  useEffect(() => {
    startSyncEngine();
    return () => {
      stopSyncEngine();
    };
  }, []);

  if (NO_SHELL.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-[308px] shrink-0 border-r border-[var(--border)] bg-[var(--shell)] px-5 py-5 lg:flex lg:flex-col">
          <div className="mb-5 rounded-[28px] border border-[var(--border)] bg-[var(--panel-strong)] p-5 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-semibold text-white">
                MG
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                  Local Monitor
                </p>
                <h1 className="text-lg font-semibold text-[var(--text)]">
                  my.gov tracker
                </h1>
              </div>
            </div>
            <p className="text-sm leading-6 text-[var(--text-soft)]">
              Локальный центр мониторинга заявлений с фоновым обновлением, очередью проверок и акцентом на последнее изменение.
            </p>
          </div>

          <nav className="flex flex-1 flex-col gap-2">
            {NAV.map(({ href, icon: Icon, label }) => {
              const active = href === '/dashboard'
                ? pathname === href || pathname.startsWith('/applications')
                : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={`group flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)] shadow-[var(--shadow-card)]'
                      : 'border-transparent bg-transparent text-[var(--text-soft)] hover:border-[var(--border)] hover:bg-[var(--panel)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon size={18} />
                    <span className="font-medium">{label}</span>
                  </span>
                  <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-[var(--accent)]' : 'bg-transparent group-hover:bg-[var(--border-strong)]'}`} />
                </Link>
              );
            })}
          </nav>

          <div className="mt-5 space-y-3">
            <Link
              href="/add"
              className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105"
            >
              <Plus size={18} />
              Добавить заявление
            </Link>

            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-card)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                    Фоновая очередь
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {sync.enabled ? 'Включена' : 'Отключена'}
                  </p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                  sync.isRunning ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--panel-strong)] text-[var(--text-soft)]'
                }`}>
                  <RefreshCw size={18} className={sync.isRunning ? 'animate-spin' : ''} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-[var(--panel-strong)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    В очереди
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[var(--text)]">
                    {sync.queueLength}
                  </p>
                </div>
                <div className="rounded-2xl bg-[var(--panel-strong)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    Интервал
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[var(--text)]">
                    {sync.intervalMinutes}м
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2 text-xs text-[var(--text-soft)]">
                <div className="flex items-center justify-between gap-3">
                  <span>Последний цикл</span>
                  <span className="text-right text-[var(--text)]">{formatSyncTime(sync.lastRunAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Следующий цикл</span>
                  <span className="text-right text-[var(--text)]">{formatSyncTime(sync.nextRunAt)}</span>
                </div>
              </div>

              {sync.lastRunError && (
                <p className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                  {sync.lastRunError}
                </p>
              )}
            </div>

            <button
              onClick={toggle}
              className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text-soft)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--text)]"
            >
              <span className="flex items-center gap-3 font-medium">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                Тема интерфейса
              </span>
              <span className="text-[var(--text)]">
                {theme === 'dark' ? 'Светлая' : 'Тёмная'}
              </span>
            </button>
          </div>
        </aside>

        <main className="min-h-screen flex-1 pb-24 lg:pb-0">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[color:color-mix(in_oklab,var(--shell)_92%,white)]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] px-2 py-2 shadow-[var(--shadow-card)]">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = href === '/dashboard'
              ? pathname === href || pathname.startsWith('/applications')
              : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] transition ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--text-soft)]'
                }`}
              >
                <Icon size={18} />
                <span className="truncate font-medium">{label}</span>
              </Link>
            );
          })}

          <Link
            href="/add"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-[var(--shadow-card)]"
            aria-label="Добавить заявление"
          >
            <Plus size={20} />
          </Link>
        </div>
      </nav>
    </div>
  );
}
