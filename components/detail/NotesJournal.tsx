'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';

import { showToast } from '@/lib/toast';

interface Note { id: string; text: string; created_at: string; remind_on: string | null; done_at: string | null }

const stamp = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const day = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;
const today = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

/**
 * «Журнал заметок»: dated notes of an application; a note with a date is a
 * reminder — pushed that morning and listed in «Требует внимания» until ticked.
 */
export default function NotesJournal({ applicationId }: { applicationId: string }) {
  const base = `/api/applications/${applicationId}/notes`;
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState('');
  const [remindOn, setRemindOn] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(base, { cache: 'no-store' }).catch(() => null);
    const list = r?.ok ? ((await r.json()) as { notes: Note[] }).notes : [];
    startTransition(() => setNotes(list));
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, remindOn: remindOn || null }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Не сохранено');
      setText('');
      setRemindOn('');
      await load();
    } catch (error) {
      showToast({ title: 'Заметка не сохранена', description: error instanceof Error ? error.message : '', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(note: Note) {
    await fetch(`${base}/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: !note.done_at }) }).catch(() => null);
    await load();
  }

  async function remove(note: Note) {
    if (!window.confirm('Удалить заметку?')) return;
    await fetch(`${base}/${note.id}`, { method: 'DELETE' }).catch(() => null);
    await load();
  }

  const field = { background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' };
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <h2 className="text-sm font-bold text-[var(--text)]">Журнал и напоминания</h2>
      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
        Что сделано по заявлению и что нужно не забыть. С датой — это напоминание: придёт push утром этого дня.
      </p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Например: позвонить клиенту насчёт справки из СЭС"
        className="mt-3 w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none" style={field} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
          Напомнить
          <input type="date" value={remindOn} min={today()} onChange={e => setRemindOn(e.target.value)}
            className="h-8 rounded-[8px] border px-2 text-[12px]" style={field} />
        </label>
        <button type="button" onClick={() => void add()} disabled={busy || !text.trim()}
          className="ml-auto rounded-[8px] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50" style={{ background: 'var(--text)', color: 'var(--surface)' }}>
          {busy ? 'Сохраняю…' : remindOn ? 'Добавить напоминание' : 'Добавить заметку'}
        </button>
      </div>

      {notes && notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {notes.map(n => {
            const overdue = n.remind_on && !n.done_at && n.remind_on <= today();
            return (
              <li key={n.id} className="rounded-[10px] p-3" style={{ background: 'var(--panel)', opacity: n.done_at ? 0.6 : 1 }}>
                <div className="flex items-start gap-2.5">
                  {n.remind_on && (
                    <input type="checkbox" checked={Boolean(n.done_at)} onChange={() => void toggle(n)} className="mt-1" aria-label="Сделано" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line text-[13px] text-[var(--text)]" style={{ textDecoration: n.done_at ? 'line-through' : undefined }}>{n.text}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {stamp(n.created_at)}
                      {n.remind_on && <span style={{ color: overdue ? 'var(--danger)' : 'var(--accent)' }}> · напомнить {day(n.remind_on)}{overdue ? ' — пора' : ''}</span>}
                      {n.done_at && ' · сделано'}
                    </p>
                  </div>
                  <button type="button" onClick={() => void remove(n)} className="text-[11px] text-[var(--text-muted)] hover:underline">удалить</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {notes && notes.length === 0 && <p className="mt-3 text-[12px] text-[var(--text-muted)]">Записей пока нет.</p>}
    </section>
  );
}
