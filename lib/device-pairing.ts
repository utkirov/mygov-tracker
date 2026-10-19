/**
 * Phone pairing by QR (design: Настройки → «Приложение Android», A1 «или»).
 * The settings page asks for a one-time code; the phone scans the QR and
 * trades the code for its own device session — no password typed on the
 * phone. Codes live only in memory: they expire in 5 minutes anyway, and a
 * server restart simply means showing a new QR.
 */
import { randomBytes } from 'node:crypto';

export const PAIRING_TTL_MS = 5 * 60 * 1000;
export const PAIRING_SCHEME = 'mygovtracker://pair';

interface PendingPairing {
  username: string;
  expiresAt: number;
}

const pending = new Map<string, PendingPairing>();

function prune(now: number): void {
  for (const [code, entry] of pending) if (entry.expiresAt <= now) pending.delete(code);
}

export function createPairingCode(username: string, now = Date.now()): { code: string; expiresAt: Date; link: string } {
  prune(now);
  // One live code per account: showing a new QR invalidates the previous one.
  for (const [code, entry] of pending) if (entry.username === username) pending.delete(code);
  const code = randomBytes(18).toString('base64url');
  const expiresAt = now + PAIRING_TTL_MS;
  pending.set(code, { username, expiresAt });
  return { code, expiresAt: new Date(expiresAt), link: `${PAIRING_SCHEME}?code=${code}` };
}

/** Returns the account the code was issued for and burns the code, or null when unknown/expired. */
export function consumePairingCode(code: string, now = Date.now()): string | null {
  prune(now);
  const entry = pending.get(code);
  if (!entry) return null;
  pending.delete(code);
  return entry.username;
}

export function resetPairingCodes(): void {
  pending.clear();
}
