import { NextRequest, NextResponse } from 'next/server';

import { readArtifacts } from '@/lib/application-artifacts';
import { readAttachments } from '@/lib/attachments';
import { erpKeyOk } from '@/lib/erp';
import { getApplicationById } from '@/lib/local-db';

export const runtime = 'nodejs';

/**
 * Для ERP: документы результата и вложения, которые уже лежат у трекера на диске.
 * На портал my.gov этот адрес не ходит: нескачанные вложения просто не попадают в список.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!erpKeyOk(req)) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const { id } = await params;
  if (!(await getApplicationById(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [artifacts, attachments] = await Promise.all([readArtifacts(id), readAttachments(id)]);
  const files = [
    ...artifacts.results.map(r => ({ name: r.file, title: r.title || 'Документ результата', kind: 'result', size: r.size, ext: '.pdf' })),
    ...(attachments ?? []).filter(a => a.file).map(a => ({
      name: `att-${a.key}`, title: a.label || a.file!.name, kind: 'attachment', size: a.file!.size,
      ext: (a.file!.name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '').toLowerCase(),
    })),
  ];
  return NextResponse.json({ files });
}
