import Link from 'next/link';
import { ArrowRight, Bell, RefreshCw, Shield } from 'lucide-react';

export function Hero() {
  return (
    <section className="pt-28 pb-16 px-4 text-center">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-pulse" />
          Для пользователей my.gov.uz
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[var(--text)] leading-tight mb-5">
          Следите за заявлениями<br />
          <span className="text-[var(--accent)]">автоматически</span>
        </h1>

        <p className="text-lg text-[var(--text2)] max-w-xl mx-auto mb-8 leading-relaxed">
          Перестаньте вручную проверять my.gov.uz. Получайте уведомления в Telegram как только изменится статус вашего заявления.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
          <Link href="/register"
            className="flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-6 py-3 rounded-xl font-semibold text-sm transition">
            Начать бесплатно <ArrowRight size={16} />
          </Link>
          <Link href="#features"
            className="flex items-center justify-center gap-2 border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface2)] px-6 py-3 rounded-xl font-medium text-sm transition">
            Узнать больше
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-6 justify-center text-center">
          {[
            { icon: <Bell size={18} />, label: 'Telegram уведомления' },
            { icon: <RefreshCw size={18} />, label: 'Автопроверка каждые 15 мин' },
            { icon: <Shield size={18} />, label: 'Безопасно — только отображение' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 text-sm text-[var(--text2)] justify-center">
              <span className="text-[var(--accent)]">{s.icon}</span>
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
