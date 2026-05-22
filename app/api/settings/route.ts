import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb, writeLocalDb, type LocalDbSettings } from '@/lib/local-db';
import { reschedule } from '@/lib/server-scheduler';

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = parseInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value: unknown): number | null {
  const parsed = parseInteger(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }

    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  return null;
}

function resolveNumericSetting(
  rawValue: unknown,
  currentValue: number | null,
  parser: (value: unknown) => number | null
): number | null {
  if (rawValue === undefined) {
    return currentValue;
  }

  if (rawValue === null) {
    return null;
  }

  if (typeof rawValue === 'string' && !rawValue.trim()) {
    return currentValue;
  }

  const parsed = parser(rawValue);
  return parsed === null ? currentValue : parsed;
}

function toFlatSettings(settings: LocalDbSettings) {
  return {
    theme: settings.theme,
    telegram_token: settings.telegram.bot_token,
    telegram_chat_id: settings.telegram.chat_id,
    auto_check_enabled: settings.auto_check.enabled,
    auto_check_interval: settings.auto_check.interval_minutes,
    auto_check_delay_ms: settings.auto_check.delay_between_checks_ms,
    auto_check_concurrency: settings.auto_check.concurrency_limit,
    sound_enabled: settings.sound_enabled,
  };
}

function mergeSettings(current: LocalDbSettings, body: Record<string, unknown>): LocalDbSettings {
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
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
  const hasNestedAutoCheckValue = (key: string) =>
    nestedAutoCheck !== null && Object.prototype.hasOwnProperty.call(nestedAutoCheck, key);
  const rawAutoCheckInterval =
    hasOwn('auto_check_interval')
      ? body.auto_check_interval
      : hasNestedAutoCheckValue('interval_minutes')
        ? nestedAutoCheck?.interval_minutes
        : undefined;
  const rawAutoCheckDelay =
    hasOwn('auto_check_delay_ms')
      ? body.auto_check_delay_ms
      : hasOwn('auto_check_delay_between_checks_ms')
        ? body.auto_check_delay_between_checks_ms
      : hasNestedAutoCheckValue('delay_between_checks_ms')
        ? nestedAutoCheck?.delay_between_checks_ms
        : undefined;
  const rawAutoCheckConcurrency =
    hasOwn('auto_check_concurrency')
      ? body.auto_check_concurrency
      : hasOwn('auto_check_concurrency_limit')
        ? body.auto_check_concurrency_limit
      : hasNestedAutoCheckValue('concurrency_limit')
        ? nestedAutoCheck?.concurrency_limit
        : undefined;
  const parsedInterval = resolveNumericSetting(
    rawAutoCheckInterval,
    current.auto_check.interval_minutes,
    parsePositiveInteger
  );
  const parsedDelay = resolveNumericSetting(
    rawAutoCheckDelay,
    current.auto_check.delay_between_checks_ms,
    parseNonNegativeInteger
  );
  const parsedConcurrency = resolveNumericSetting(
    rawAutoCheckConcurrency,
    current.auto_check.concurrency_limit,
    parsePositiveInteger
  );
  const hasValidIntervalUpdate =
    rawAutoCheckInterval !== undefined &&
    rawAutoCheckInterval !== null &&
    !(typeof rawAutoCheckInterval === 'string' && !rawAutoCheckInterval.trim()) &&
    parsePositiveInteger(rawAutoCheckInterval) !== null;
  const autoCheckEnabled =
    hasOwn('auto_check_enabled') || hasNestedAutoCheckValue('enabled')
      ? parseBoolean(
          hasOwn('auto_check_enabled')
            ? body.auto_check_enabled
            : nestedAutoCheck?.enabled
        ) ?? current.auto_check.enabled
      : hasValidIntervalUpdate
        ? true
        : current.auto_check.enabled;

  const soundEnabled =
    hasOwn('sound_enabled')
      ? (parseBoolean(body.sound_enabled) ?? current.sound_enabled)
      : current.sound_enabled;

  return {
    theme: nextTheme,
    telegram: {
      bot_token: telegramToken,
      chat_id: telegramChatId,
    },
    auto_check: {
      enabled: autoCheckEnabled,
      interval_minutes: parsedInterval,
      delay_between_checks_ms: parsedDelay,
      concurrency_limit: parsedConcurrency,
    },
    sound_enabled: soundEnabled,
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
  reschedule();

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
