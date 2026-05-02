import Link from 'next/link';
import { Check, X } from 'lucide-react';

const PLANS = [
  {
    name: 'Бесплатный',
    price: 0,
    highlight: false,
    features: [
      { label: 'До 3 заявлений', ok: true },
      { label: 'Ручная проверка статусов', ok: true },
      { label: 'Telegram-уведомления', ok: false },
      { label: 'Автоматическая проверка', ok: false },
      { label: 'Проекты', ok: false },
      { label: 'Архив', ok: false },
    ],
  },
  {
    name: 'Стандарт',
    price: '49 900',
    highlight: true,
    features: [
      { label: 'До 30 заявлений', ok: true },
      { label: 'Ручная проверка статусов', ok: true },
      { label: 'Telegram-уведомления', ok: true },
      { label: 'Автопроверка каждый час', ok: true },
      { label: 'До 5 проектов', ok: true },
      { label: 'Архив', ok: true },
    ],
  },
  {
    name: 'Pro',
    price: '149 900',
    highlight: false,
    features: [
      { label: 'Безлимитные заявления', ok: true },
      { label: 'Ручная проверка статусов', ok: true },
      { label: 'Telegram-уведомления', ok: true },
      { label: 'Автопроверка каждые 15 мин', ok: true },
      { label: 'Безлимитные проекты', ok: true },
      { label: 'Архив', ok: true },
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-16 px-4 bg-[var(--surface)]">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--text)] mb-3">Простые тарифы</h2>
          <p className="text-[var(--text2)]">Начните бесплатно, перейдите на платный когда будете готовы</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map(plan => (
            <div key={plan.name}
              className={`card p-5 flex flex-col ${plan.highlight ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : ''}`}>
              {plan.highlight && (
                <div className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest mb-2">Популярный</div>
              )}
              <h3 className="text-lg font-bold text-[var(--text)]">{plan.name}</h3>
              <div className="my-3">
                {plan.price === 0
                  ? <span className="text-2xl font-bold text-[var(--text)]">Бесплатно</span>
                  : <><span className="text-2xl font-bold text-[var(--text)]">{plan.price}</span>
                     <span className="text-sm text-[var(--text2)]"> сум/мес</span></>}
              </div>
              <div className="flex flex-col gap-2 mb-6">
                {plan.features.map(f => (
                  <div key={f.label} className="flex items-center gap-2 text-sm">
                    {f.ok
                      ? <Check size={14} className="text-green-500 shrink-0" />
                      : <X size={14} className="text-[var(--text3)] shrink-0" />}
                    <span className={f.ok ? 'text-[var(--text2)]' : 'text-[var(--text3)]'}>{f.label}</span>
                  </div>
                ))}
              </div>
              <Link href="/register"
                className={`mt-auto block text-center py-2.5 rounded-xl text-sm font-semibold transition ${
                  plan.highlight
                    ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                    : 'border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]'
                }`}>
                {plan.price === 0 ? 'Начать бесплатно' : `Выбрать ${plan.name}`}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
