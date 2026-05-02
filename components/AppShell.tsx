'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Archive, Settings, Sun, Moon, Plus, ChevronRight, LogOut,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';

const NO_SHELL = ['/login', '/register', '/'];

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Главная' },
  { href: '/archive',   icon: Archive,          label: 'Архив'   },
  { href: '/settings',  icon: Settings,         label: 'Настройки' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.email) setUserEmail(d.email); })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  if (NO_SHELL.some(p => pathname === p || (p !== '/' && pathname.startsWith(p)))) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-16 lg:w-60 bg-[var(--surface)] border-r border-[var(--border)] z-30 transition-all duration-200">

        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-[var(--border)] shrink-0">
          <span className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm shrink-0">M</span>
          <span className="hidden lg:block font-bold text-sm text-[var(--text)] truncate">my.gov tracker</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (pathname.startsWith(href + '/') && href !== '/dashboard') || pathname === href;
            const isDash = href === '/dashboard';
            const isActive = isDash ? pathname === href || pathname.startsWith('/applications') : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]'
                  }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="hidden lg:block">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-[var(--border)] flex flex-col gap-0.5 shrink-0">
          <Link
            href="/add"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-all"
          >
            <Plus size={18} className="shrink-0" />
            <span className="hidden lg:block">Новая заявка</span>
          </Link>
          <button
            onClick={toggle}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] text-sm transition-all"
          >
            {theme === 'dark'
              ? <Sun size={18} className="shrink-0" />
              : <Moon size={18} className="shrink-0" />}
            <span className="hidden lg:block">{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
          </button>
          {userEmail && (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-6 h-6 rounded-full bg-[var(--accent)]/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-[var(--accent)]">
                  {userEmail[0].toUpperCase()}
                </span>
              </div>
              <span className="hidden lg:block text-xs text-[var(--text2)] truncate flex-1">{userEmail}</span>
              <button
                onClick={handleLogout}
                className="hidden lg:flex items-center justify-center w-6 h-6 rounded-lg hover:bg-[var(--surface2)] text-[var(--text3)] hover:text-red-500 transition-all"
                title="Выйти"
              >
                <LogOut size={13} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 md:ml-16 lg:ml-60 min-h-screen pb-20 md:pb-0 transition-all duration-200">
        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[var(--surface)] border-t border-[var(--border)] z-30 safe-area-inset-bottom">
        <div className="flex items-stretch h-16">
          {NAV.map(({ href, icon: Icon, label }) => {
            const isDash = href === '/dashboard';
            const isActive = isDash
              ? pathname === href || pathname.startsWith('/applications')
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all
                  ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text3)]'}`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
          <Link
            href="/add"
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all
              ${pathname === '/add' ? 'text-[var(--accent)]' : 'text-[var(--text3)]'}`}
          >
            <Plus size={22} strokeWidth={pathname === '/add' ? 2.5 : 1.8} />
            <span className="text-[10px] font-medium">Новая</span>
          </Link>
        </div>
      </nav>

    </div>
  );
}
