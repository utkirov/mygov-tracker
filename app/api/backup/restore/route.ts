import { NextRequest, NextResponse } from 'next/server';

import { listBackups, stageRestore } from '@/lib/backup';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ backups: await listBackups() });
}

/**
 * Restores a backup, then exits so the supervisor (scripts/supervisor.mjs)
 * starts the server again on the restored data.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.name !== 'string') return NextResponse.json({ error: 'Укажите файл копии' }, { status: 400 });

  try {
    const result = await stageRestore(body.name);
    console.log(`[Backup] Restore of ${body.name} staged (${result.restoredFiles} files), safety copy ${result.safetyBackup} — restarting to apply`);
    setTimeout(() => process.exit(0), 1500).unref?.();
    return NextResponse.json({ ok: true, ...result, restarting: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Не удалось восстановить' }, { status: 500 });
  }
}
