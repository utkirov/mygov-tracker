import { NextRequest, NextResponse } from 'next/server';

import { openDb } from '@/lib/sqlite-db';

const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('application_id');
    const parsedLimit = Math.min(parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10), 200);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT;

    const db = await openDb();

    let rows;
    if (applicationId) {
      rows = db.prepare(`
        SELECT * FROM check_log
        WHERE application_id = ?
        ORDER BY checked_at DESC
        LIMIT ?
      `).all(applicationId, limit);
    } else {
      rows = db.prepare(`
        SELECT * FROM check_log
        ORDER BY checked_at DESC
        LIMIT ?
      `).all(limit);
    }

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[check-log] Failed to read check log:', err);
    return NextResponse.json({ error: 'Failed to read check log' }, { status: 500 });
  }
}
