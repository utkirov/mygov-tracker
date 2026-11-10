import { NextRequest, NextResponse } from 'next/server';

import { deleteNote, setNoteDone } from '@/lib/app-notes';

/** PATCH {done} — tick a reminder; DELETE — remove the note. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  const body = await request.json().catch(() => ({})) as { done?: unknown };
  const ok = await setNoteDone(noteId, body.done === true);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Заметка не найдена' }, { status: 404 });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  const ok = await deleteNote(noteId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Заметка не найдена' }, { status: 404 });
}
