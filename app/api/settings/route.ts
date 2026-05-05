import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb, writeLocalDb, type LocalDbSettings } from '@/lib/local-db';

function toFlatSettings(settings: LocalDbSettings) {
  return {
    theme: settings.theme,
    telegram_token: settings.telegram.bot_token,
    telegram_chat_id: settings.telegram.chat_id,
    auto_check_interval: settings.auto_check.interval_minutes
      ? String(settings.auto_check.interval_minutes)
      : '',
  };
}

function mergeSettings(current: LocalDbSettings, body: Record<string, unknown>): LocalDbSettings {
  const nextTheme =
    body.theme === 'light' || body.theme === 'dark' || body.theme === 'system'
      ? body.theme
      : current.theme;

  const telegramToken =
    typeof body.telegram_token === 'string'
      ? body.telegram_token
      : body.telegram && typeof body.telegram === 'object' && typeof (body.telegram as Record<string, unknown>).bot_token === 'string'
        ? (body.telegram as Record<string, string>).bot_token
        : current.telegram.bot_token;

  const telegramChatId =
    typeof body.telegram_chat_id === 'string'
      ? body.telegram_chat_id
      : body.telegram && typeof body.telegram === 'object' && typeof (body.telegram as Record<string, unknown>).chat_id === 'string'
        ? (body.telegram as Record<string, string>).chat_id
        : current.telegram.chat_id;

  const nestedAutoCheck = body.auto_check && typeof body.auto_check === 'object'
    ? body.auto_check as Record<string, unknown>
    : null;
  const rawAutoCheckInterval =
    typeof body.auto_check_interval === 'string' || typeof body.auto_check_interval === 'number'
      ? body.auto_check_interval
      : nestedAutoCheck?.interval_minutes;
  const parsedInterval = rawAutoCheckInterval === '' || rawAutoCheckInterval === null || rawAutoCheckInterval === undefined
    ? null
    : Number.parseInt(String(rawAutoCheckInterval), 10);
  const autoCheckEnabled =
    typeof nestedAutoCheck?.enabled === 'boolean'
      ? nestedAutoCheck.enabled
      : parsedInterval !== null && !Number.isNaN(parsedInterval) && parsedInterval > 0;

  return {
    theme: nextTheme,
    telegram: {
      bot_token: telegramToken,
      chat_id: telegramChatId,
    },
    auto_check: {
      enabled: autoCheckEnabled,
      interval_minutes:
        parsedInterval !== null && !Number.isNaN(parsedInterval) && parsedInterval > 0
          ? parsedInterval
          : null,
    },
  };
}

export async function GET() {
  const db = await readLocalDb();
  return NextResponse.json(toFlatSettings(db.settings));
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const db = await readLocalDb();
  db.settings = mergeSettings(db.settings, body);
  db.meta.updated_at = new Date().toISOString();

  await writeLocalDb(db);

  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  const { token, chatId } = await request.json();
  if (!token || !chatId) {
    return NextResponse.json({ error: 'token and chatId are required' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'Test message from my.gov tracker',
        parse_mode: 'HTML',
      }),
    });
    const data = await response.json();

    if (response.ok) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: data.description ?? 'Telegram error' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Connection failed' }, { status: 502 });
  }
}
