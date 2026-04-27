import { NextRequest, NextResponse } from 'next/server';
import { parsePdfBuffer } from '@/lib/pdf-parser';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fields = await parsePdfBuffer(buffer);

  await supabase.storage.from('pdfs').upload(file.name, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  });

  return NextResponse.json({ fields, filename: file.name });
}
