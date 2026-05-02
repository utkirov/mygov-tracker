import Link from 'next/link';

export function LandingNav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-[var(--surface)]/80 backdrop-blur-md border-b border-[var(--border)]">
      <div className="max-w-5xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm">M</div>
          <span className="font-bold text-sm text-[var(--text)]">my.gov tracker</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login"
            className="text-sm text-[var(--text2)] hover:text-[var(--text)] px-3 py-1.5 transition">
            Войти
          </Link>
          <Link href="/register"
            className="text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-4 py-1.5 rounded-xl font-medium transition">
            Начать бесплатно
          </Link>
        </div>
      </div>
    </nav>
  );
}
