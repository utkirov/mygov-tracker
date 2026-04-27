import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchApplicationStatus } from '@/lib/status-checker';

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: app, error } = await supabase
    .from('applications')
    .select('application_number, verification_password, status')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

  const checked = await fetchApplicationStatus(app.application_number, app.verification_password);
  if (!checked) {
    return NextResponse.json({ error: 'Не удалось получить статус с my.gov.uz' }, { status: 502 });
  }

  const statusChanged = checked.status !== app.status;

  if (statusChanged) {
    await supabase.from('status_history').insert([{
      application_id: id,
      status: checked.status,
      current_action: checked.current_action,
      acting_party: checked.acting_party,
    }]);
  }

  const { data: updated } = await supabase
    .from('applications')
    .update({
      status: checked.status,
      current_action: checked.current_action,
      acting_party: checked.acting_party,
      last_changed_date: checked.last_changed_date || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  return NextResponse.json({ application: updated, statusChanged });
}
