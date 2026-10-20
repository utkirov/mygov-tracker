import { NextRequest, NextResponse } from 'next/server';

import { getClient } from '@/lib/clients';
import { readCreateBody, serializeLinks } from '@/lib/share-link-api';
import { createClientShareLink, listClientShareLinks } from '@/lib/share-links';

export const runtime = 'nodejs';

/** One link for all applications of the client. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getClient(id))) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
  return NextResponse.json({ links: await serializeLinks(await listClientShareLinks(id)) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getClient(id))) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
  const opts = await readCreateBody(request);
  if (opts instanceof NextResponse) return opts;
  const [link] = await serializeLinks([await createClientShareLink(id, opts)]);
  return NextResponse.json({ link }, { status: 201 });
}
