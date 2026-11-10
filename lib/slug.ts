/**
 * Human-readable share addresses: /s/372313367-hostel-apz-k3x9m2pa instead of
 * /s/<24 random characters>. The readable part is only a hint; the 8 random
 * characters at the end (36^8 ≈ 2.8·10¹² variants) are what keeps the link
 * unguessable.
 */
import { randomInt } from 'node:crypto';

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Uzbek Cyrillic
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX = 8;
/** Matches a generated slug: readable part, dash, random tail. */
export const SLUG_RE = /^[a-z0-9-]{1,72}-[a-z0-9]{8}$/;

/** «Жилой дом, ул. Навои» → «zhiloy-dom-ul-navoi»; Uzbek «O'rif aka» → «orif-aka». */
export function slugify(text: string, max = 48): string {
  const latin = text.toLowerCase()
    .split('').map(ch => CYRILLIC[ch] ?? ch).join('')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[ʻʼ‘’`´']/g, '');
  const slug = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.slice(0, max).replace(/-+$/g, '');
}

export function randomSuffix(): string {
  let out = '';
  for (let i = 0; i < SUFFIX; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** «<number>-<title>-<random>», or just «link-<random>» when there's nothing readable. */
export function makeShareSlug(parts: string[]): string {
  const readable = slugify(parts.filter(Boolean).join(' ')) || 'link';
  return `${readable}-${randomSuffix()}`;
}
