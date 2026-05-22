import { NextRequest, NextResponse } from 'next/server';

import { openDb } from '@/lib/sqlite-db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get('application_id');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

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
}
