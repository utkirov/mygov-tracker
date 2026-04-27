import { NextRequest, NextResponse } from 'next/server';
import { parsePdfBuffer } from '@/lib/pdf-parser';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fields = await parsePdfBuffer(buffer);

  return NextResponse.json({ fields, filename: file.name });
}
