import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: app, error } = await supabase
    .from('applications')
    .select('pdf_filename')
    .eq('id', id)
    .single();

  if (error || !app?.pdf_filename) {
    return NextResponse.json({ error: 'PDF не найден' }, { status: 404 });
  }

  const { data, error: urlError } = await supabase.storage
    .from('pdfs')
    .createSignedUrl(app.pdf_filename, 300);

  if (urlError || !data?.signedUrl) {
    return NextResponse.json({ error: 'Не удалось открыть PDF' }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Файл не найден' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from('pdfs').upload(file.name, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  await supabase.from('applications').update({ pdf_filename: file.name }).eq('id', id);

  return NextResponse.json({ ok: true });
}
