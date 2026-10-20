import { NextRequest, NextResponse } from 'next/server';

import { createClient, listClients, loadClientIndex, setApplicationClient, suggestClients } from '@/lib/clients';
import { listApplications } from '@/lib/local-db';

export const runtime = 'nodejs';

/** Clients with counts, plus names found in object names of unassigned applications. */
export async function GET() {
  const apps = await listApplications({});
  const [clients, index] = await Promise.all([listClients(), loadClientIndex(undefined, apps)]);
  const suggestions = suggestClients(apps, new Set(index.byApplication.keys()));
  return NextResponse.json({ clients, suggestions });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const client = await createClient({ name: String(body.name ?? ''), phone: String(body.phone ?? ''), note: String(body.note ?? '') });
    const ids = Array.isArray(body.applicationIds) ? body.applicationIds.filter((x): x is string => typeof x === 'string') : [];
    for (const id of ids) await setApplicationClient(id, client.id);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Не удалось создать клиента' }, { status: 400 });
  }
}
