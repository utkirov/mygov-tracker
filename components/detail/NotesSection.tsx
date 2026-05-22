'use client';

interface Props {
  notes: string;
  savingNotes: boolean;
  onNotesChange: (value: string) => void;
  onBlur: () => void;
}

export default function NotesSection({ notes, savingNotes, onNotesChange, onBlur }: Props) {
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Заметки</p>
          <h2 className="mt-1 text-sm font-bold text-[var(--text)]">Контекст по заявлению</h2>
        </div>
        {savingNotes && <span className="text-[10px] text-[var(--text-muted)]">Сохраняю…</span>}
      </div>

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
