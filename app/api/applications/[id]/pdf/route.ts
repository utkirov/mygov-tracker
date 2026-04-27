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
