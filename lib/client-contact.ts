/** Call / Telegram links for a client's contacts — shared by the pages (no server code). */

/** «+998 (90) 123-45-67» → «tel:+998901234567»; null when there are too few digits. */
export function phoneHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null;
}

/**
 * Telegram chat with the client: by username when it is known, otherwise by
 * the phone number (t.me/+998… opens the chat if the number is on Telegram).
 */
export function telegramHref(telegram: string | null | undefined, phone: string | null | undefined): string | null {
  const user = (telegram ?? '').replace(/^@/, '').trim();
  if (/^[A-Za-z0-9_]{4,32}$/.test(user)) return `https://t.me/${user}`;
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 9) return null;
  // A local Uzbek number (9 digits) gets the country code.
  return `https://t.me/+${digits.length === 9 ? `998${digits}` : digits}`;
}
