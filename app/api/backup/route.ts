import { NextResponse } from 'next/server';

import { createBackup, readBackupStatus } from '@/lib/backup';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await readBackupStatus());
}

export async function POST() {
  const status = await createBackup();
  return NextResponse.json(status, { status: status.lastError ? 500 : 200 });
}
