import { Upload, RefreshCw, Bell } from 'lucide-react';

const STEPS = [
  {
    num: '01',
    icon: <Upload size={20} />,
    title: 'Загрузите PDF-квитанцию',
    desc: 'Скачайте квитанцию с my.gov.uz и загрузите в трекер. Все данные заполнятся автоматически.',
  },
  {
    num: '02',
    icon: <RefreshCw size={20} />,
    title: 'Трекер следит автоматически',
    desc: 'Система регулярно проверяет статус через my.gov.uz. Вам ничего не нужно делать.',
  },
  {
    num: '03',
    icon: <Bell size={20} />,
    title: 'Получайте уведомления',
    desc: 'Как только статус изменится — вы сразу получите сообщение в Telegram с деталями.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--text)] mb-3">Как это работает</h2>
          <p className="text-[var(--text2)]">Начать работу займёт меньше минуты</p>
        </div>
        <div className="flex flex-col md:flex-row gap-6">
          {STEPS.map((step, i) => (
            <div key={step.num} className="flex-1 relative">
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-7 left-full w-full h-[2px] bg-[var(--border)] -translate-x-1/2 z-0" />
              )}
              <div className="card p-5 relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xs font-bold">
                    {step.num}
                  </div>
                  <div className="text-[var(--text2)]">{step.icon}</div>
                </div>
                <h3 className="font-semibold text-[var(--text)] mb-1.5">{step.title}</h3>
                <p className="text-sm text-[var(--text2)] leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
