import { networkInterfaces } from 'node:os';
import { NextResponse } from 'next/server';

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

  return NextResponse.json({ lanIps, port: 3000 });
}
