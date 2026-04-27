import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: app, error } = await supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: history } = await supabase
    .from('status_history')
    .select('*')
    .eq('application_id', id)
    .order('recorded_at', { ascending: false });

  return NextResponse.json({ application: app, history: history ?? [] });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const allowed = ['notes', 'object_name', 'application_number', 'verification_password',
                   'service_name', 'organization', 'sms_phone', 'project_id'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: app } = await supabase
    .from('applications')
    .select('pdf_filename')
    .eq('id', id)
    .single();

  if (app?.pdf_filename) {
    await supabase.storage.from('pdfs').remove([app.pdf_filename]);
  }

  await supabase.from('status_history').delete().eq('application_id', id);
  const { error } = await supabase.from('applications').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
