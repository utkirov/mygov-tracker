import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb } from '@/lib/local-db';
import { buildCycleSummaryMessage, isTelegramConfigured, sendTelegramMessage } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.kind !== 'cycle_summary') {
    return NextResponse.json({ error: 'Unsupported notification kind' }, { status: 400 });
  }

  const checkedCount = typeof body.checkedCount === 'number' ? body.checkedCount : 0;
  const changedCount = typeof body.changedCount === 'number' ? body.changedCount : 0;
  const errorCount = typeof body.errorCount === 'number' ? body.errorCount : 0;
  const finishedAt =
    typeof body.finishedAt === 'string' && body.finishedAt.trim()
      ? body.finishedAt
      : new Date().toISOString();

  if (changedCount <= 0 && errorCount <= 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const db = await readLocalDb();
  if (!isTelegramConfigured(db.settings)) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'telegram_not_configured' });
  }

  const text = buildCycleSummaryMessage({
    checkedCount,
    changedCount,
    errorCount,
    finishedAt,
  });

  try {
    await sendTelegramMessage(db.settings, text);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Telegram send failed' },
      { status: 502 }
    );
  }
}
