import { NextRequest, NextResponse } from 'next/server';

import { getApplicationById, readSettings, touchMeta, updateApplicationFields } from '@/lib/local-db';
import { checkOne } from '@/lib/server-scheduler';
import { buildManualCheckResultMessage, isTelegramConfigured, sendTelegramMessage } from '@/lib/telegram';
import { getStatusType } from '@/types';

/**
 * Checks one application right now. Shares checkOne() with the background
 * scheduler, so a manual check also writes the check log, sends push and the
 * Telegram change notification, and stores the screenshot / status PDF /
 * result documents shown on the application page.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isManual = req.nextUrl.searchParams.get('manual') === 'true';
  const application = await getApplicationById(id);

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  if (application.archived || getStatusType(application.acting_party, application.status) === 'completed') {
    const idleAt = new Date().toISOString();
    await updateApplicationFields(id, {
      sync_state: 'idle',
      next_check_at: null,
      last_error: '',
      updated_at: idleAt,
    });
    await touchMeta(idleAt);

    return NextResponse.json(
      { error: 'Archived and completed applications are excluded from checks' },
      { status: 409 }
    );
  }

  const { result } = await checkOne(application, { manual: isManual, awaitOutputs: isManual });
  const updated = await getApplicationById(id);
  if (!updated) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  if (result === 'error') {
    return NextResponse.json({ error: updated.last_error || 'Не удалось получить статус от my.gov.uz' }, { status: 502 });
  }

  if (result === 'unchanged' && isManual) {
    const settings = await readSettings();
    if (isTelegramConfigured(settings)) {
      await sendTelegramMessage(settings, buildManualCheckResultMessage(updated))
        .catch(err => console.error('[check route] Telegram error:', err));
    }
  }

  return NextResponse.json({ application: updated, statusChanged: application.status !== updated.status });
}
