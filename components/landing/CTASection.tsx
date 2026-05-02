import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function CTASection() {
  return (
    <section className="py-20 px-4 text-center">
      <div className="max-w-xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-[var(--text)] mb-4">
          Начните отслеживать заявления уже сегодня
        </h2>
        <p className="text-[var(--text2)] mb-8">
          Бесплатный тариф — до 3 заявлений, без карты
        </p>
        <Link href="/register"
          className="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-8 py-3.5 rounded-xl font-semibold text-sm transition">
          Создать аккаунт <ArrowRight size={16} />
        </Link>
        <p className="text-xs text-[var(--text3)] mt-3">Без кредитной карты · Бесплатно навсегда</p>
      </div>
    </section>
  );
}
