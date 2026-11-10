/**
 * Looks of the public share page /s/<…> (all in TURON PROJECT colours):
 *   light        — A «Светлая»: cream page, white cards, the full detail blocks
 *   dark         — B «Тёмная»: like turonproject.uz — ink page, violet accents
 *   summary      — C «Сводка»: one card with status, days, stage N of M,
 *                  approvals, last event; details folded below
 *   summary-dark — D «Сводка тёмная»: the same card on the dark Turon page
 *   timeline-auto — H «Хронология» (default): status on top, then every stage as a
 *                  vertical timeline with dates; light or dark by the visitor's phone theme
 *   timeline     — E the same, always light
 *   timeline-dark — G the same, always dark
 *   brand        — F «Фирменная»: «Сводка» with a violet Turon header block
 * The default is a setting (Ссылки → «Вид страницы клиента»); `?design=` on a
 * link previews another look without changing it.
 */
import { openDb } from './sqlite-db';

export type ShareDesign = 'light' | 'dark' | 'summary' | 'summary-dark' | 'timeline' | 'timeline-dark' | 'timeline-auto' | 'brand';

export const SHARE_DESIGNS: Array<{ id: ShareDesign; letter: string; label: string; hint: string }> = [
  { id: 'timeline-auto', letter: 'H', label: 'Хронология · авто', hint: 'Этапы по датам; светлая или тёмная — как тема телефона клиента' },
  { id: 'timeline', letter: 'E', label: 'Хронология · светлая', hint: 'Статус сверху, ниже все этапы по датам — всегда светлая' },
  { id: 'timeline-dark', letter: 'G', label: 'Хронология · тёмная', hint: 'Этапы по датам на тёмном фоне, как сайт turonproject.uz' },
  { id: 'summary', letter: 'C', label: 'Сводка', hint: 'Главное в одной карточке: статус, дни, этап, согласования, последнее событие' },
  { id: 'summary-dark', letter: 'D', label: 'Сводка тёмная', hint: 'Та же сводка на тёмном фоне, как сайт turonproject.uz' },
  { id: 'brand', letter: 'F', label: 'Фирменная', hint: 'Сводка с фиолетовой шапкой TURON PROJECT — самая «брендовая»' },
  { id: 'light', letter: 'A', label: 'Светлая', hint: 'Все блоки сразу раскрыты: этапы, согласования, история' },
  { id: 'dark', letter: 'B', label: 'Тёмная', hint: 'Все блоки раскрыты, тёмный фон и фиолетовые акценты' },
];

/** Looks built around the summary card. */
export const isSummaryLook = (d: ShareDesign) => d === 'summary' || d === 'summary-dark' || d === 'brand';
export const isTimelineLook = (d: ShareDesign) => d === 'timeline' || d === 'timeline-dark' || d === 'timeline-auto';
export const isDarkLook = (d: ShareDesign) => d === 'dark' || d === 'summary-dark' || d === 'timeline-dark';

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
  return parseShareDesign(row?.share_design) ?? 'timeline-auto';
}

export async function setShareDesign(design: ShareDesign, rootPath?: string): Promise<void> {
  const db = await openDb(rootPath);
  db.prepare('UPDATE settings SET share_design = ? WHERE id = 1').run(design);
}
