import { NextRequest, NextResponse } from 'next/server';

import { setApplicationClient } from '@/lib/clients';
import { getApplicationById } from '@/lib/local-db';

export const runtime = 'nodejs';

/** { clientId: string | null } — assign the application to a client or detach it. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getApplicationById(id))) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { clientId?: unknown };
  const clientId = typeof body.clientId === 'string' && body.clientId ? body.clientId : null;
  try {
    await setApplicationClient(id, clientId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Ошибка' }, { status: 400 });
  }
}
