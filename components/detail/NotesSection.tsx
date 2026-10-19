'use client';

import SectionHeading from './SectionHeading';

interface Props {
  notes: string;
  savingNotes: boolean;
  onNotesChange: (value: string) => void;
  onBlur: () => void;
}

export default function NotesSection({ notes, savingNotes, onNotesChange, onBlur }: Props) {
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <SectionHeading
        eyebrow="Заметки"
        title="Контекст по заявлению"
        action={savingNotes ? <span className="text-[10px] text-[var(--text-muted)]">Сохраняю…</span> : undefined}
      />

      <textarea
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        onBlur={onBlur}
        className="min-h-[140px] w-full rounded-[10px] border px-3 py-3 text-xs leading-5 outline-none transition focus:border-[var(--accent)]"
        style={{ borderColor: 'var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
        placeholder="Внутренний контекст, договорённости, замечания по процессу."
      />
    </section>
  );
}
