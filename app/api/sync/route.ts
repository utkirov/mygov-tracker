import { NextResponse } from 'next/server';

import { triggerImmediateCycle } from '@/lib/server-scheduler';

export async function POST() {
  triggerImmediateCycle().catch(err => console.error('[sync route] cycle error:', err));
  return NextResponse.json({ ok: true, message: 'Cycle started' });
}
