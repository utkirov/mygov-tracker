import { NextRequest, NextResponse } from 'next/server';

import { addNote, listNotes } from '@/lib/app-notes';
import { getApplicationById } from '@/lib/local-db';

/** Dated notes and reminders of an application (lib/app-notes.ts). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ notes: await listNotes(id) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getApplicationById(id))) return NextResponse.json({ error: 'Заявление не найдено' }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { text?: unknown; remindOn?: unknown };
  try {
    const note = await addNote(id, { text: typeof body.text === 'string' ? body.text : '', remindOn: typeof body.remindOn === 'string' ? body.remindOn : null });
    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Не сохранено' }, { status: 400 });
  }
}
