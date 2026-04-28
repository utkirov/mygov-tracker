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

  if (error) {
    console.error('[Preview] Application not found:', id);
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  console.log('[Preview] Fetching for app:', app.application_number);
  const html = await fetchApplicationHtml(app.application_number, app.verification_password);

  if (!html) {
    console.error('[Preview] Failed to fetch HTML for:', app.application_number);
    return new NextResponse(
      `<html><body style="font-family: sans-serif; padding: 20px;">
        <h2>Не удалось загрузить страницу</h2>
        <p>Проверьте номер заявки и пароль.</p>
        <p>Номер заявки: ${app.application_number}</p>
        <p>Возможные причины:</p>
        <ul>
          <li>Сервер my.gov.uz недоступен</li>
          <li>Неверный номер заявки</li>
          <li>Неверный пароль для проверки</li>
        </ul>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 502 }
    );
  }

  // Inject base tag so relative CSS/JS/images resolve against the original host
  const patched = html.replace('<head>', `<head><base href="${ORIGIN}/">`);

  return new NextResponse(patched, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
