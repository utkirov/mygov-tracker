import { Bell, RefreshCw, Archive, FolderOpen, Search, Smartphone } from 'lucide-react';

const FEATURES = [
  {
    icon: <Bell size={22} />,
    title: 'Telegram-уведомления',
    desc: 'Мгновенное сообщение в Telegram как только изменится статус. Не нужно заходить на сайт.',
    color: 'text-blue-500 bg-blue-500/10',
  },
  {
    icon: <RefreshCw size={22} />,
    title: 'Автоматическая проверка',
    desc: 'Система сама проверяет все ваши заявления каждые 15–60 минут. Вы отдыхаете — трекер работает.',
    color: 'text-orange-500 bg-orange-500/10',
  },
  {
    icon: <Search size={22} />,
    title: 'Все заявления в одном месте',
    desc: 'Загрузите PDF-квитанцию, и система автоматически извлечёт всю информацию о заявлении.',
    color: 'text-purple-500 bg-purple-500/10',
  },
  {
    icon: <FolderOpen size={22} />,
    title: 'Проекты и группировка',
    desc: 'Объединяйте заявления по объектам или клиентам. Идеально для юристов и застройщиков.',
    color: 'text-green-500 bg-green-500/10',
  },
  {
    icon: <Archive size={22} />,
    title: 'Архив завершённых',
    desc: 'Завершённые заявления уходят в архив и не загромождают рабочий список.',
    color: 'text-gray-500 bg-gray-500/10',
  },
  {
    icon: <Smartphone size={22} />,
    title: 'Работает на телефоне',
    desc: 'Полноценный интерфейс на мобильном. Проверяйте статусы в дороге.',
    color: 'text-blue-400 bg-blue-400/10',
  },
];

export function Features() {
  return (
    <section id="features" className="py-16 px-4 bg-[var(--surface)]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--text)] mb-3">Всё что нужно для отслеживания</h2>
          <p className="text-[var(--text2)] max-w-xl mx-auto">Инструмент создан специально для работы с my.gov.uz</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="card p-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.color}`}>
                {f.icon}
              </div>
              <h3 className="font-semibold text-[var(--text)] mb-1.5">{f.title}</h3>
              <p className="text-sm text-[var(--text2)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
