import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb } from '@/lib/local-db';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readLocalDb();
  const apps = db.applications
    .filter(a => a.project_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json(apps);
}
