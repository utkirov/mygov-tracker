/**
 * Dated notes on an application («позвонил клиенту», «донесли справку») and
 * reminders: a note with `remind_on` (a Tashkent calendar day) is pushed that
 * morning (lib/push-schedule.ts) and shown in «Требует внимания» until done.
 * The old single free-text note (applications.notes) stays as it was.
 */
import { randomUUID } from 'node:crypto';

import { openDb } from './sqlite-db';

export interface AppNote {
  id: string;
  application_id: string;
  text: string;
  created_at: string;
  /** YYYY-MM-DD, or null for a plain note. */
  remind_on: string | null;
  done_at: string | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function tashkentDay(now = new Date()): string {
  return new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}

export async function listNotes(applicationId: string, rootPath?: string): Promise<AppNote[]> {
  const db = await openDb(rootPath);
  return db.prepare('SELECT * FROM application_notes WHERE application_id = ? ORDER BY created_at DESC').all(applicationId) as AppNote[];
}

export async function addNote(applicationId: string, input: { text: string; remindOn?: string | null }, rootPath?: string, now = new Date()): Promise<AppNote> {
  const text = input.text.trim().slice(0, 2000);
  if (!text) throw new Error('Пустая заметка');
  const remind = input.remindOn && DAY_RE.test(input.remindOn) ? input.remindOn : null;
  const note: AppNote = { id: randomUUID(), application_id: applicationId, text, created_at: now.toISOString(), remind_on: remind, done_at: null };
  const db = await openDb(rootPath);
  db.prepare('INSERT INTO application_notes (id, application_id, text, created_at, remind_on, done_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(note.id, note.application_id, note.text, note.created_at, note.remind_on, note.done_at);
  return note;
}

/** Marks a reminder done / not done. */
export async function setNoteDone(noteId: string, done: boolean, rootPath?: string, now = new Date()): Promise<boolean> {
  const db = await openDb(rootPath);
  return db.prepare('UPDATE application_notes SET done_at = ? WHERE id = ?').run(done ? now.toISOString() : null, noteId).changes > 0;
}

export async function deleteNote(noteId: string, rootPath?: string): Promise<boolean> {
  const db = await openDb(rootPath);
  return db.prepare('DELETE FROM application_notes WHERE id = ?').run(noteId).changes > 0;
}

export interface DueReminder extends AppNote { application_number: string; title: string }

/** Open reminders due on `day` or earlier, oldest first. */
export async function dueReminders(day = tashkentDay(), rootPath?: string): Promise<DueReminder[]> {
  const db = await openDb(rootPath);
  return db.prepare(`
    SELECT n.*, a.application_number, COALESCE(NULLIF(a.object_name, ''), a.service_name) AS title
    FROM application_notes n JOIN applications a ON a.id = n.application_id
    WHERE n.remind_on IS NOT NULL AND n.done_at IS NULL AND n.remind_on <= ?
    ORDER BY n.remind_on, n.created_at`).all(day) as DueReminder[];
}
