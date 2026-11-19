import { NextResponse } from 'next/server';

import { erpEnabled, listErpProjects } from '@/lib/erp';

export const runtime = 'nodejs';

/** Проекты ERP «TPG Проекты» для выбора в форме заявления. available=false — связь не настроена или ERP не отвечает. */
export async function GET() {
  const projects = await listErpProjects();
  return NextResponse.json({ enabled: erpEnabled(), available: projects !== null, projects: projects ?? [] });
}
