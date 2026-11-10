/**
 * Three looks of the public share page /s/<…> (all in TURON PROJECT colours):
 *   light   — A «Светлая»: cream page, white cards, ink contact bar on top
 *   dark    — B «Тёмная»: like turonproject.uz — ink page, violet accents
 *   summary — C «Сводка»: one big card first (status, days, stage N of M),
 *             details folded below, call / Telegram buttons
 * The default is a setting (Ссылки → «Вид страницы клиента»); `?design=` on a
 * link previews another look without changing it.
 */
import { openDb } from './sqlite-db';

export type ShareDesign = 'light' | 'dark' | 'summary';

export const SHARE_DESIGNS: Array<{ id: ShareDesign; letter: string; label: string; hint: string }> = [
  { id: 'light', letter: 'A', label: 'Светлая', hint: 'Кремовый фон, белые карточки, контакты сверху на тёмной полосе' },
  { id: 'dark', letter: 'B', label: 'Тёмная', hint: 'Как сайт turonproject.uz: тёмный фон, фиолетовые акценты' },
  { id: 'summary', letter: 'C', label: 'Сводка', hint: 'Сначала главное: статус, дни, этап N из M; подробности свёрнуты' },
];

export function parseShareDesign(value: unknown): ShareDesign | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  const byLetter = SHARE_DESIGNS.find(d => d.letter.toLowerCase() === v);
  if (byLetter) return byLetter.id;
  return SHARE_DESIGNS.some(d => d.id === v) ? (v as ShareDesign) : null;
}

export async function getShareDesign(rootPath?: string): Promise<ShareDesign> {
  const db = await openDb(rootPath);
  const row = db.prepare('SELECT share_design FROM settings WHERE id = 1').get() as { share_design?: string } | undefined;
  return parseShareDesign(row?.share_design) ?? 'light';
}

export async function setShareDesign(design: ShareDesign, rootPath?: string): Promise<void> {
  const db = await openDb(rootPath);
  db.prepare('UPDATE settings SET share_design = ? WHERE id = 1').run(design);
}
