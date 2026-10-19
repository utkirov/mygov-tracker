import { networkInterfaces } from 'node:os';
import { NextResponse } from 'next/server';

import { getAppToken } from '@/lib/app-token';

export async function GET() {
  const nets = networkInterfaces();
  const lanIps: string[] = [];

  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIps.push(iface.address);
      }
    }
  }

  // Public address through the Cloudflare Tunnel (see docs/HANDOFF.md); override with PUBLIC_BASE_URL.
  const publicUrl = process.env.PUBLIC_BASE_URL?.trim() || 'https://tracker.turonproject.uz';
  return NextResponse.json({ lanIps, port: Number.parseInt(process.env.PORT || '3040', 10), token: getAppToken(), publicUrl });
}
