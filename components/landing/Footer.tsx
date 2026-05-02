import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)] py-8 px-4">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-xs">M</div>
          <span className="text-sm font-semibold text-[var(--text)]">my.gov tracker</span>
        </div>
        <div className="flex gap-6">
          <Link href="#features" className="text-xs text-[var(--text3)] hover:text-[var(--text2)]">Возможности</Link>
          <Link href="#pricing" className="text-xs text-[var(--text3)] hover:text-[var(--text2)]">Тарифы</Link>
          <Link href="/login" className="text-xs text-[var(--text3)] hover:text-[var(--text2)]">Войти</Link>
        </div>
        <p className="text-xs text-[var(--text3)]">© 2026 my.gov tracker</p>
      </div>
    </footer>
  );
}
