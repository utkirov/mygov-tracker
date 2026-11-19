import { NextRequest, NextResponse } from 'next/server';

import { erpKeyOk } from '@/lib/erp';

/** Для ERP: трекер умеет отдавать файлы заявлений (часть Б). Старый трекер ответит 404 — ERP тогда файлы не забирает. */
export async function GET(req: NextRequest) {
  if (!erpKeyOk(req)) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  return NextResponse.json({ ok: true, version: 1 });
}
