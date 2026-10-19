import { NextRequest, NextResponse } from 'next/server';

import { looksLikeApk, MAX_APK_BYTES, publishRelease, readRelease } from '@/lib/app-release';

export const runtime = 'nodejs';

/** The published Android build — the app checks this on start (design A8). */
export async function GET() {
  return NextResponse.json({ release: await readRelease() });
}

/** Settings → «Приложение Android» → «Загрузить APK». */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Ожидается форма с файлом APK' }, { status: 400 });
  }

  const file = form.get('file');
  const version = String(form.get('version') ?? '').trim();
  const versionCode = Number.parseInt(String(form.get('versionCode') ?? ''), 10);
  const notes = String(form.get('notes') ?? '').trim().slice(0, 2000);

  if (!(file instanceof File)) return NextResponse.json({ error: 'Выберите файл APK' }, { status: 400 });
  if (!/^\d+\.\d+\.\d+$/.test(version)) return NextResponse.json({ error: 'Версия в формате 1.2.0' }, { status: 400 });
  if (!Number.isInteger(versionCode) || versionCode < 1) return NextResponse.json({ error: 'Код версии — целое число больше 0' }, { status: 400 });
  if (file.size > MAX_APK_BYTES) return NextResponse.json({ error: 'APK больше 200 МБ' }, { status: 413 });

  const current = await readRelease();
  if (current && versionCode <= current.versionCode) {
    return NextResponse.json({ error: `Код версии должен быть больше опубликованного (${current.versionCode}), иначе телефоны не увидят обновление` }, { status: 409 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) {
    return NextResponse.json({ error: 'Файл загрузился не полностью — попробуйте ещё раз' }, { status: 400 });
  }
  if (!looksLikeApk(buffer)) return NextResponse.json({ error: 'Это не APK-файл' }, { status: 400 });

  return NextResponse.json({ release: await publishRelease(buffer, { version, versionCode, notes }) });
}
