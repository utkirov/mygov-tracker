/**
 * Telegram notifications to clients who subscribed from a share page
 * (/start s_<token> in the tracker's bot). Only what the share page shows:
 * status, stage, approvals count, the final result — never passwords, phones
 * or notes. Stops by itself when the link expires or is revoked.
 */
import { stageSummary, type Checklist } from './checklist';
import { clientOfApplication } from './clients';
import { readSettings, type LocalDbApplication } from './local-db';
import { shareUrl, subscribersFor, subscribePayload, subscribeChat, unsubscribeChat } from './share-links';
import { getMyGovStatus } from '@/types';

const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function sendTo(botToken: string, chatId: string, text: string): Promise<void> {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  // 403 = the client blocked the bot: stop writing to them.
  if (resp.status === 403) await unsubscribeChat(chatId);
  else if (!resp.ok) console.error('[ClientNotify] sendMessage failed:', resp.status);
}

let botUsername: { token: string; name: string | null; at: number } | null = null;

/** @username of the configured bot (getMe, cached for an hour) — for the «Подписаться» deep link. */
export async function getBotUsername(): Promise<string | null> {
  const settings = await readSettings();
  const token = settings.telegram.bot_token.trim();
  if (!token) return null;
  if (botUsername && botUsername.token === token && Date.now() - botUsername.at < 3_600_000) return botUsername.name;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(5000) });
    const data = await r.json() as { ok: boolean; result?: { username?: string } };
    botUsername = { token, name: data.ok ? data.result?.username ?? null : null, at: Date.now() };
  } catch {
    botUsername = { token, name: null, at: Date.now() - 3_000_000 }; // retry in ~10 min
  }
  return botUsername.name;
}

export async function telegramSubscribeUrl(token: string): Promise<string | null> {
  const name = await getBotUsername();
  return name ? `https://t.me/${name}?start=${await subscribePayload(token)}` : null;
}

export interface ClientChange {
  statusChanged: boolean;
  actionChanged: boolean;
  completed: boolean;
  newVerdicts: number;
}

export function buildClientMessage(app: Pick<LocalDbApplication, 'application_number' | 'object_name' | 'service_name' | 'status' | 'current_action'>, checklist: Checklist | null, change: ClientChange, url: string): string {
  const title = app.object_name || app.service_name || `Заявление № ${app.application_number}`;
  const lines = [`📋 <b>${esc(title)}</b>`, `Заявление № ${esc(app.application_number)}`];
  const status = getMyGovStatus(app.status).label;
  if (change.completed) {
    lines.push(checklist?.result?.kind === 'rejected' ? `✕ <b>Итог: отказ</b>` : `✓ <b>Итог: ${esc(status)}</b>`);
    const failed = checklist?.result?.criteria.filter(c => c.status === 'bad').map(c => c.label) ?? [];
    if (failed.length) lines.push(`Не выполнено: ${esc(failed.slice(0, 3).join('; '))}`);
  } else {
    if (change.statusChanged) lines.push(`Статус: <b>${esc(status)}</b>`);
    const stage = checklist ? stageSummary(checklist) : null;
    if (stage?.stage) lines.push(`Этап ${stage.stageIndex} из ${stage.stageCount}: ${esc(stage.stage)}`);
    else if (app.current_action) lines.push(`Сейчас: ${esc(app.current_action)}`);
    if (checklist && checklist.counts.total > 0 && (change.newVerdicts > 0 || change.statusChanged)) {
      lines.push(`Согласования: ${checklist.counts.ok} из ${checklist.counts.total}${checklist.counts.bad ? `, отказов ${checklist.counts.bad}` : ''}`);
    }
  }
  lines.push('', `<a href="${esc(url)}">Открыть статус</a>`);
  return lines.join('\n');
}

/** Called by the scheduler after a check found something the client cares about. */
export async function notifyClientSubscribers(app: LocalDbApplication, checklist: Checklist | null, change: ClientChange): Promise<number> {
  if (!change.statusChanged && !change.actionChanged && !change.completed && change.newVerdicts === 0) return 0;
  const settings = await readSettings();
  const botToken = settings.telegram.bot_token.trim();
  if (!botToken) return 0;
  const client = await clientOfApplication(app.id);
  const subs = await subscribersFor(app.id, client?.id ?? null);
  for (const s of subs) {
    await sendTo(botToken, s.chat_id, buildClientMessage(app, checklist, change, shareUrl(s.link.token)))
      .catch(err => console.error('[ClientNotify] error:', err));
  }
  return subs.length;
}

/**
 * Bot messages from chats that are not the owner's: /start s_<token> subscribes,
 * /stop unsubscribes. Returns false when the message isn't for clients.
 */
export async function handleClientBotMessage(botToken: string, chatId: string, text: string, isSubscriber: boolean): Promise<boolean> {
  const start = text.match(/^\/start\s+(s_[A-Za-z0-9_-]+)$/i);
  if (start) {
    const link = await subscribeChat(start[1], chatId);
    await sendTo(botToken, chatId, link
      ? `✅ Вы подписаны на обновления${link.label ? ` («${esc(link.label)}»)` : ''}.\nПришлю сообщение, когда изменится статус или этап${link.expires_at ? ` — до ${new Date(link.expires_at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}.\nОтписаться — /stop`
      : 'Ссылка не действует: срок истёк или её отозвали. Попросите прислать новую.');
    return true;
  }
  if (/^\/stop\b/i.test(text)) {
    const n = await unsubscribeChat(chatId);
    await sendTo(botToken, chatId, n ? 'Вы отписались от обновлений.' : 'Подписок нет.');
    return true;
  }
  if (isSubscriber) {
    await sendTo(botToken, chatId, 'Это бот уведомлений о статусе заявлений. Статус — по ссылке, которую вам прислали. Отписаться — /stop');
    return true;
  }
  return false;
}
