import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchApplicationHtml } from '@/lib/status-checker';

const ORIGIN = 'https://oldmy.gov.uz:4433';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: app, error } = await supabase
    .from('applications')
    .select('application_number, verification_password')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

  const html = await fetchApplicationHtml(app.application_number, app.verification_password);
  if (!html) return NextResponse.json({ error: 'Не удалось загрузить страницу' }, { status: 502 });

  // Inject base tag so relative CSS/JS/images resolve against the original host
  const patched = html.replace('<head>', `<head><base href="${ORIGIN}/">`);

  return new NextResponse(patched, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
