'use client';

interface Props {
  notes: string;
  savingNotes: boolean;
  onNotesChange: (value: string) => void;
  onBlur: () => void;
}

export default function NotesSection({ notes, savingNotes, onNotesChange, onBlur }: Props) {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Заметки
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
            Контекст по заявлению
          </h2>
        </div>
        {savingNotes && (
          <span className="text-xs text-[var(--text-muted)]">Сохраняю…</span>
        )}
      </div>

      <textarea
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        onBlur={onBlur}
        className="mt-4 min-h-[160px] w-full rounded-[24px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 text-sm leading-6 text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
        placeholder="Внутренний контекст, договорённости, замечания по процессу."
      />
    </section>
  );
}
