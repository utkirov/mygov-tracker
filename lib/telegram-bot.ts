/**
 * Interactive Telegram bot: lets the user browse applications and view
 * status/history directly from the bot (@Mygov_ariza_bot), instead of only
 * receiving push notifications. Uses long polling (getUpdates) — this app
 * has no public HTTPS endpoint for a webhook. Loaded once on server startup
 * via instrumentation.ts, same as lib/server-scheduler.ts.
 */
import path from 'node:path';

import { readLocalDb, readSettings, type LocalDbApplication, type LocalDbStatusHistory } from './local-db';
import { resolveLocalProjectRoot } from './local-paths';
import { acquireProcessLock, releaseProcessLock } from './process-lock';
import { fetchRepositoryFiles } from './repository-files';
import { checkOne, triggerImmediateCycle } from './server-scheduler';
import { fetchApplicationHtml } from './status-checker';
import { captureApplicationStatusScreenshot } from './status-screenshot';
import { isTelegramConfigured, sendTelegramDocumentToChat } from './telegram';
import { isApplicationCheckable, isCompletedStatus } from '@/types';

interface TelegramChat { id: number }
interface TelegramMessage { chat: TelegramChat; text?: string }
interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: { chat: TelegramChat; message_id: number };
}
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}
interface GetUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
}

let _polling = false;
let _offset = 0;

// Chats currently waiting for a search query as their next plain-text
// message, set by the "🔍 Поиск" button. In-memory is fine — this is a
// single-user tool; a server restart just means the user taps the button
// again.
const _awaitingSearch = new Set<string>();

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function callTelegramApi(botToken: string, method: string, body: Record<string, unknown>): Promise<void> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.error(`[TelegramBot] ${method} failed:`, resp.status, await resp.text().catch(() => ''));
    }
  } catch (err) {
    console.error(`[TelegramBot] ${method} error:`, err);
  }
}

const MENU_HOME_CALLBACK = 'menu_home';
const MENU_ACTIVE_CALLBACK = 'menu_active';
const MENU_ARCHIVED_CALLBACK = 'menu_archived';
const MENU_SEARCH_CALLBACK = 'menu_search';
const CHECK_ALL_CALLBACK_DATA = 'check_all';
const APP_CALLBACK_PREFIX = 'app:';

function applicationTitle(app: LocalDbApplication): string {
  return app.object_name || app.service_name || `Заявление ${app.application_number}`;
}

/** Buttons show only the application's title — no number, per the operator's own request (the number is already visible once a card is open). */
export function buildApplicationListKeyboard(applications: LocalDbApplication[]) {
  return {
    inline_keyboard: applications.map((app) => [{
      text: applicationTitle(app).slice(0, 60),
      callback_data: `${APP_CALLBACK_PREFIX}${app.id}`,
    }]),
  };
}

function buildMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📋 Активные', callback_data: MENU_ACTIVE_CALLBACK }],
      [{ text: '🗄 Архивные', callback_data: MENU_ARCHIVED_CALLBACK }],
      [{ text: '🔍 Поиск', callback_data: MENU_SEARCH_CALLBACK }],
    ],
  };
}

async function sendMainMenu(botToken: string, chatId: string): Promise<void> {
  _awaitingSearch.delete(chatId);
  await callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: 'Выберите раздел:',
    reply_markup: buildMainMenuKeyboard(),
  });
}

export function buildApplicationCardMessage(application: LocalDbApplication, history: LocalDbStatusHistory[]): string {
  const title = applicationTitle(application);
  const lines = [
    `🧾 <b>№</b> ${escapeHtml(application.application_number)}`,
    `🏷 <b>Объект</b> ${escapeHtml(title)}`,
    application.organization ? `🏛 <b>Организация</b> ${escapeHtml(application.organization)}` : '',
    '',
    `📌 <b>Статус</b> ${escapeHtml(application.status)}`,
    application.current_action ? `🔄 <b>Действие</b> ${escapeHtml(application.current_action)}` : '',
    application.acting_party ? `👤 <b>Действует</b> ${escapeHtml(application.acting_party)}` : '',
    `🗓 <b>Изменено</b> ${escapeHtml(formatDate(application.last_changed_date))}`,
    `🕒 <b>Проверено</b> ${escapeHtml(formatDate(application.last_checked_at))}`,
  ].filter(Boolean);

  if (history.length > 0) {
    lines.push('', '📜 <b>История:</b>');
    for (const entry of history.slice(0, 8)) {
      lines.push(`• ${escapeHtml(formatDate(entry.recorded_at))} — ${escapeHtml(entry.status)}`);
    }
  } else {
    lines.push('', 'История изменений пока пуста.');
  }

  return lines.join('\n');
}

/**
 * Shows an application's card. When the application is still checkable
 * (not archived/completed), this first triggers a live check against
 * my.gov.uz via the same checkOne() the background scheduler uses — the
 * user asked to "open an application and find out its current status" from
 * the bot, not just see whatever the last background cycle happened to
 * cache. checkOne() also returns the fetched my.gov.uz session, reused here
 * to attach a full-page screenshot of the live status — no second fetch
 * needed.
 *
 * Once an application is finalized (approved/rejected), my.gov.uz publishes
 * official result documents in its repository (see lib/repository-files.ts,
 * same mechanism as the change-notification flow). Already-archived
 * applications skip the live checkOne() but still get a plain HTML fetch
 * here so those documents can be found and sent — the user may want to
 * re-download them at any time, not only at the moment of completion.
 */
async function sendApplicationCard(botToken: string, chatId: string, applicationId: string): Promise<void> {
  let db = await readLocalDb();
  let application = db.applications.find((a) => a.id === applicationId);
  if (!application) {
    await callTelegramApi(botToken, 'sendMessage', { chat_id: chatId, text: 'Заявление не найдено (возможно, было удалено).' });
    return;
  }

  let screenshotPng: Buffer | null = null;
  let statusHtml: string | null = null;

  if (isApplicationCheckable(application)) {
    await callTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `🔄 Проверяю № ${escapeHtml(application.application_number)} через my.gov.uz…`,
    });
    const { session } = await checkOne(application);
    db = await readLocalDb();
    application = db.applications.find((a) => a.id === applicationId) ?? application;
    if (session) {
      statusHtml = session.page.html;
      screenshotPng = await captureApplicationStatusScreenshot(session.page, application.verification_password);
    }
  } else if (isCompletedStatus(application.status)) {
    const page = await fetchApplicationHtml(application.application_number, application.verification_password);
    statusHtml = page?.html ?? null;
  }

  const history = db.status_history
    .filter((h) => h.application_id === application.id)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));

  await callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: buildApplicationCardMessage(application, history),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '⬅️ В меню', callback_data: MENU_HOME_CALLBACK }]] },
  });

  if (screenshotPng) {
    await sendTelegramDocumentToChat(
      botToken,
      chatId,
      screenshotPng,
      `status-${application.application_number}.png`,
      '📷 Скриншот текущей страницы my.gov.uz',
      'image/png'
    ).catch((err) => console.error('[TelegramBot] Failed to send status screenshot:', err));
  }

  if (statusHtml && isCompletedStatus(application.status)) {
    const files = await fetchRepositoryFiles(statusHtml);
    for (let i = 0; i < files.length; i++) {
      const { ref, file } = files[i];
      await sendTelegramDocumentToChat(
        botToken,
        chatId,
        file,
        `document-${application.application_number}-${i + 1}.pdf`,
        `📄 <b>${escapeHtml(ref.title || 'Документ из репозитория')}</b>\nОфициальный документ с repository.gov.uz\n🔑 PIN: <code>${escapeHtml(ref.pin)}</code>`
      ).catch((err) => console.error('[TelegramBot] Failed to send repository file:', err));
    }
  }
}

async function sendApplicationList(botToken: string, chatId: string, mode: 'active' | 'archived'): Promise<void> {
  const db = await readLocalDb();
  const filtered = [...db.applications]
    .filter((a) => (mode === 'archived' ? a.archived : !a.archived))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  if (filtered.length === 0) {
    await callTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: mode === 'archived' ? 'Архивных заявлений нет.' : 'Активных заявлений нет.',
      reply_markup: { inline_keyboard: [[{ text: '⬅️ В меню', callback_data: MENU_HOME_CALLBACK }]] },
    });
    return;
  }

  const keyboard = buildApplicationListKeyboard(filtered);
  if (mode === 'active') {
    keyboard.inline_keyboard.unshift([{ text: '🔄 Проверить все', callback_data: CHECK_ALL_CALLBACK_DATA }]);
  }
  keyboard.inline_keyboard.push([{ text: '⬅️ В меню', callback_data: MENU_HOME_CALLBACK }]);

  await callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: mode === 'archived' ? 'Архивные заявления:' : 'Активные заявления:',
    reply_markup: keyboard,
  });
}

async function promptSearch(botToken: string, chatId: string): Promise<void> {
  _awaitingSearch.add(chatId);
  await callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: '🔍 Введите номер заявки или часть названия объекта/услуги:',
  });
}

async function runSearch(botToken: string, chatId: string, rawQuery: string): Promise<void> {
  const query = rawQuery.trim();
  const q = query.toLowerCase();
  const db = await readLocalDb();
  const results = db.applications
    .filter((a) =>
      a.application_number.includes(query) ||
      applicationTitle(a).toLowerCase().includes(q)
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  if (results.length === 0) {
    await callTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `По запросу «${escapeHtml(query)}» ничего не найдено.`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '⬅️ В меню', callback_data: MENU_HOME_CALLBACK }]] },
    });
    return;
  }

  const keyboard = buildApplicationListKeyboard(results);
  keyboard.inline_keyboard.push([{ text: '⬅️ В меню', callback_data: MENU_HOME_CALLBACK }]);
  await callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `Результаты поиска «${escapeHtml(query)}»:`,
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

async function handleUpdate(botToken: string, chatId: string, update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    const cq = update.callback_query;
    await callTelegramApi(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });

    if (cq.data === MENU_HOME_CALLBACK) {
      await sendMainMenu(botToken, chatId);
      return;
    }
    if (cq.data === MENU_ACTIVE_CALLBACK) {
      await sendApplicationList(botToken, chatId, 'active');
      return;
    }
    if (cq.data === MENU_ARCHIVED_CALLBACK) {
      await sendApplicationList(botToken, chatId, 'archived');
      return;
    }
    if (cq.data === MENU_SEARCH_CALLBACK) {
      await promptSearch(botToken, chatId);
      return;
    }
    if (cq.data === CHECK_ALL_CALLBACK_DATA) {
      await callTelegramApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text: '🔄 Проверка всех активных заявлений запущена. Изменения придут отдельными уведомлениями по мере обнаружения.',
      });
      triggerImmediateCycle().catch((err) => console.error('[TelegramBot] triggerImmediateCycle error:', err));
      return;
    }
    if (cq.data?.startsWith(APP_CALLBACK_PREFIX)) {
      await sendApplicationCard(botToken, chatId, cq.data.slice(APP_CALLBACK_PREFIX.length));
      return;
    }
    return;
  }

  const text = update.message?.text?.trim();
  if (!text) return;

  if (/^\/check(all)?\b/i.test(text)) {
    _awaitingSearch.delete(chatId);
    await callTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: '🔄 Проверка всех активных заявлений запущена. Изменения придут отдельными уведомлениями по мере обнаружения.',
    });
    triggerImmediateCycle().catch((err) => console.error('[TelegramBot] triggerImmediateCycle error:', err));
    return;
  }

  if (/^\/start\b/i.test(text)) {
    await sendMainMenu(botToken, chatId);
    return;
  }

  if (_awaitingSearch.has(chatId)) {
    _awaitingSearch.delete(chatId);
    await runSearch(botToken, chatId, text);
    return;
  }

  if (/^\d{5,}$/.test(text)) {
    const db = await readLocalDb();
    const application = db.applications.find((a) => a.application_number === text);
    if (!application) {
      await callTelegramApi(botToken, 'sendMessage', { chat_id: chatId, text: `Заявление № ${escapeHtml(text)} не найдено.` });
      return;
    }
    await sendApplicationCard(botToken, chatId, application.id);
    return;
  }

  await sendMainMenu(botToken, chatId);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CONFLICT_BACKOFF_MS = 10 * 60 * 1000;
let _networkFailures = 0;
let _conflictReported = false;

/** 409 = a webhook is set for this bot or another process polls it. Explain once, then retry rarely. */
async function handleConflict(botToken: string): Promise<void> {
  if (!_conflictReported) {
    _conflictReported = true;
    let reason = 'другой процесс уже опрашивает этого бота (getUpdates)';
    try {
      const info = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`).then((r) => r.json()) as { result?: { url?: string } };
      if (info.result?.url) reason = `для бота установлен webhook на ${new URL(info.result.url).host} — Telegram отдаёт команды туда`;
    } catch {
      // keep the generic reason
    }
    console.error(`[TelegramBot] 409 Conflict: ${reason}. Команды и кнопки бота не работают; уведомления отправляются. Повтор раз в 10 минут.`);
  }
  await sleep(CONFLICT_BACKOFF_MS);
}

async function pollOnce(): Promise<void> {
  const settings = await readSettings();
  if (!isTelegramConfigured(settings)) {
    await sleep(10_000);
    return;
  }

  const { bot_token: botToken, chat_id: notificationsChatId, commands_chat_id: commandsChatId } = settings.telegram;
  // The notifications chat_id is usually a broadcast channel, which can't
  // hold a two-way conversation — interactive commands (browse/history) come
  // through the separate commands_chat_id instead, once the user has set it.
  const trustedChatIds = new Set([notificationsChatId, commandsChatId].filter(Boolean));

  let resp: Response;
  try {
    resp = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${_offset}&timeout=25`);
  } catch (err) {
    // No internet: log the first failure of a streak only, back off up to 2 min.
    if (_networkFailures === 0) console.error('[TelegramBot] getUpdates network error:', err instanceof Error ? err.message : err);
    _networkFailures++;
    await sleep(Math.min(5_000 * 2 ** Math.min(_networkFailures, 5), 120_000));
    return;
  }
  if (_networkFailures > 0) {
    console.log(`[TelegramBot] Connection restored after ${_networkFailures} failed attempts`);
    _networkFailures = 0;
  }

  if (resp.status === 409) {
    await handleConflict(botToken);
    return;
  }
  if (_conflictReported) {
    console.log('[TelegramBot] Conflict resolved — receiving commands again');
    _conflictReported = false;
  }

  if (!resp.ok) {
    console.error('[TelegramBot] getUpdates failed:', resp.status);
    await sleep(30_000);
    return;
  }

  const data = (await resp.json()) as GetUpdatesResponse;
  if (!data.ok || !data.result) {
    console.error('[TelegramBot] getUpdates returned not-ok:', data.description);
    await sleep(30_000);
    return;
  }

  for (const update of data.result) {
    _offset = update.update_id + 1;

    const incomingChatId = String(update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? '');
    if (!incomingChatId) continue;

    // Single-user tool — only ever act on a chat explicitly trusted in
    // Настройки (notification channel or the separate commands chat).
    // Rather than silently ignoring an untrusted chat (which looks like the
    // bot is broken), surface its id once so it can be pasted into
    // Настройки → Telegram → Chat ID для команд if the user wants to use it.
    if (!trustedChatIds.has(incomingChatId)) {
      if (update.message) {
        await callTelegramApi(botToken, 'sendMessage', {
          chat_id: incomingChatId,
          text: `🔒 Этот чат не настроен для управления ботом.\nChat ID: <code>${escapeHtml(incomingChatId)}</code>\nЧтобы использовать его для команд (список заявлений, история), вставьте это значение в Настройки → Telegram → Chat ID для команд.`,
          parse_mode: 'HTML',
        });
      }
      continue;
    }

    try {
      await handleUpdate(botToken, incomingChatId, update);
    } catch (err) {
      console.error('[TelegramBot] Failed to handle update:', err);
    }
  }
}

export function startTelegramBotPolling(): void {
  if (_polling) return;
  const lockFile = path.join(resolveLocalProjectRoot(), 'data', 'telegram-bot.lock');
  const lock = acquireProcessLock(lockFile);
  if (!lock.ok) {
    console.error(`[TelegramBot] Another server (PID ${lock.holder}) already polls the bot — this one only sends notifications`);
    return;
  }
  process.once('exit', () => releaseProcessLock(lockFile));
  _polling = true;
  console.log('[TelegramBot] Polling started');

  const loop = async () => {
    while (_polling) {
      await pollOnce();
    }
  };
  void loop();
}

export function stopTelegramBotPolling(): void {
  _polling = false;
}
