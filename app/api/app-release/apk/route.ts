import { createReadStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';

import { NextResponse } from 'next/server';

import { getApkPath, readRelease } from '@/lib/app-release';

export const runtime = 'nodejs';

/** Streams the published APK to the phone's in-app updater. */
export async function GET() {
  const release = await readRelease();
  const apkPath = getApkPath();
  if (!release || !existsSync(apkPath)) {
    return NextResponse.json({ error: 'APK ещё не опубликован' }, { status: 404 });
  }
  const stream = Readable.toWeb(createReadStream(apkPath)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': String(release.size),
      'Content-Disposition': `attachment; filename="mygov-tracker-${release.version}.apk"`,
      'Cache-Control': 'no-store',
    },
  });
}
