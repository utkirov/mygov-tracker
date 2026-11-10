'use client';

import { DocRow } from '@/components/detail/PdfSection';

/** PNG cards to send in Telegram/WhatsApp (lib/card-images.tsx): access details or the application's progress. */
export default function CardsSection({ applicationId }: { applicationId: string }) {
  const base = `/api/applications/${applicationId}/card`;
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <h2 className="text-sm font-bold text-[var(--text)]">Карточки для отправки</h2>
      <p className="mt-0.5 mb-3 text-[12px] text-[var(--text-muted)]">Картинка PNG — сохраните и отправьте в Telegram или WhatsApp.</p>
      <div className="space-y-2">
        <DocRow title="Доступ к заявлению" subtitle="Проект, номер заявки и пароль проверки">
          <a href={`${base}?type=access`} target="_blank" rel="noopener noreferrer">Открыть</a>
          <a href={`${base}?type=access&download=1`}>Скачать</a>
        </DocRow>
        <DocRow title="Ход заявления" subtitle="Даты подачи и изменения, сколько дней в работе, этап">
          <a href={`${base}?type=progress`} target="_blank" rel="noopener noreferrer">Открыть</a>
          <a href={`${base}?type=progress&download=1`}>Скачать</a>
        </DocRow>
      </div>
    </section>
  );
}
