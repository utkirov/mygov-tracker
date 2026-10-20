import { NextRequest, NextResponse } from 'next/server';

import { getClient, setApplicationClient } from '@/lib/clients';
import { getApplicationById } from '@/lib/local-db';

export const runtime = 'nodejs';

/** Attach several applications to the client at once ({ applicationIds }). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getClient(id))) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { applicationIds?: unknown };
  const ids = Array.isArray(body.applicationIds) ? body.applicationIds.filter((x): x is string => typeof x === 'string') : [];
  let attached = 0;
  for (const appId of ids) {
    if (!(await getApplicationById(appId))) continue;
    await setApplicationClient(appId, id);
    attached += 1;
  }
  return NextResponse.json({ attached });
}
