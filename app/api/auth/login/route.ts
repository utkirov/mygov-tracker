import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { pin } = await request.json();

  if (pin !== process.env.APP_PIN) {
    return NextResponse.json({ error: 'Неверный PIN' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('app_session', pin, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
