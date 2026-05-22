import type { LocalDbApplication, LocalDbApplicationChangeField, LocalDbSettings } from '@/lib/local-db';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatValue(value: string | null): string {
  const normalized = value?.trim();
  return normalized ? normalized : 'пусто';
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fieldLabel(field: LocalDbApplicationChangeField): string {
  switch (field) {
    case 'status':
      return 'Статус';
    case 'current_action':
      return 'Текущее действие';
    case 'acting_party':
      return 'Действует';
    case 'last_changed_date':
      return 'Последнее изменение';
    default:
      return field;
  }
}

export function isTelegramConfigured(settings: LocalDbSettings): boolean {
  return Boolean(settings.telegram.bot_token.trim() && settings.telegram.chat_id.trim());
}

export async function sendTelegramMessage(settings: LocalDbSettings, text: string): Promise<void> {
  if (!isTelegramConfigured(settings)) {
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${settings.telegram.bot_token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: settings.telegram.chat_id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { description?: string } | null;
    throw new Error(payload?.description ?? `Telegram request failed with status ${response.status}`);
  }
}

export function buildApplicationChangeMessage(args: {
  application: LocalDbApplication;
  changedFields: LocalDbApplicationChangeField[];
  previousValues: Record<LocalDbApplicationChangeField, string | null>;
  nextValues: Record<LocalDbApplicationChangeField, string | null>;
}): string {
  const { application, changedFields, previousValues, nextValues } = args;
  const title = application.object_name || application.service_name || `Заявление ${application.application_number}`;
  const lines = [
    '📣 <b>Изменение по заявлению</b>',
    `🧾 <b>№</b> ${escapeHtml(application.application_number)}`,
    `🏷 <b>Объект</b> ${escapeHtml(title)}`,
    '',
    '🔄 <b>Что изменилось:</b>',
    ...changedFields.map((field) => (
      `• <b>${fieldLabel(field)}</b>: ${escapeHtml(formatValue(previousValues[field]))} → ${escapeHtml(formatValue(nextValues[field]))}`
    )),
    '',
    `📌 <b>Текущий статус</b> ${escapeHtml(application.status)}`,
    `🗓 <b>Последнее изменение</b> ${escapeHtml(formatDate(application.last_changed_date))}`,
    `🕒 <b>Проверено</b> ${escapeHtml(formatDate(application.last_checked_at))}`,
  ];

  return lines.join('\n');
}

export function buildApplicationErrorMessage(application: LocalDbApplication, errorText: string): string {
  const title = application.object_name || application.service_name || `Заявление ${application.application_number}`;

  return [
    '⚠️ <b>Ошибка проверки заявления</b>',
    `🧾 <b>№</b> ${escapeHtml(application.application_number)}`,
    `🏷 <b>Объект</b> ${escapeHtml(title)}`,
    `📌 <b>Статус</b> ${escapeHtml(formatValue(application.status))}`,
    `❗ <b>Ошибка</b> ${escapeHtml(errorText)}`,
    `🕒 <b>Время</b> ${escapeHtml(formatDate(application.last_checked_at))}`,
  ].join('\n');
}

export function buildApplicationCompletedMessage(application: LocalDbApplication): string {
  const title = application.object_name || application.service_name || `Заявление ${application.application_number}`;
  const isRejected = application.status.toLowerCase().includes('отклон') || application.status.toLowerCase().includes('аннулир');

  return [
    isRejected ? '❌ <b>Заявление завершено (отказ)</b>' : '✅ <b>Заявление завершено!</b>',
    `🧾 <b>№</b> ${escapeHtml(application.application_number)}`,
    `🏷 <b>Объект</b> ${escapeHtml(title)}`,
    `📌 <b>Итоговый статус</b> ${escapeHtml(application.status)}`,
    application.current_action ? `🔄 <b>Последнее действие</b> ${escapeHtml(application.current_action)}` : '',
    `🗓 <b>Дата изменения</b> ${escapeHtml(formatDate(application.last_changed_date))}`,
    `🕒 <b>Проверено</b> ${escapeHtml(formatDate(application.last_checked_at))}`,
  ].filter(Boolean).join('\n');
}

export function buildManualCheckResultMessage(application: LocalDbApplication): string {
  const title = application.object_name || application.service_name || `Заявление ${application.application_number}`;

  return [
    '🔍 <b>Ручная проверка завершена</b>',
    `🧾 <b>№</b> ${escapeHtml(application.application_number)}`,
    `🏷 <b>Объект</b> ${escapeHtml(title)}`,
    `📌 <b>Статус</b> ${escapeHtml(application.status)}`,
    `ℹ️ Изменений не обнаружено`,
    `🕒 <b>Проверено</b> ${escapeHtml(formatDate(application.last_checked_at))}`,
  ].join('\n');
}

export function buildCycleSummaryMessage(args: {
  checkedCount: number;
  changedCount: number;
  errorCount: number;
  finishedAt: string;
}): string {
  const { checkedCount, changedCount, errorCount, finishedAt } = args;

  return [
    '📬 <b>Итоги цикла проверки</b>',
    `📄 <b>Проверено</b> ${checkedCount}`,
    `✅ <b>С изменениями</b> ${changedCount}`,
    `⚠️ <b>С ошибками</b> ${errorCount}`,
    `🕒 <b>Завершено</b> ${escapeHtml(formatDate(finishedAt))}`,
    '',
    errorCount > 0
      ? 'Обрати внимание: в этом цикле были ошибки, проверь детали в приложении.'
      : changedCount > 0
        ? 'Новые изменения уже сохранены в приложении.'
        : 'Изменений нет, всё тихо.',
  ].join('\n');
}
