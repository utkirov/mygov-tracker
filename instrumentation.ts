export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  const { ensureAppToken } = await import('./lib/app-token');
  ensureAppToken();

  // Session secret + revocation state must be ready before proxy.ts verifies
  // any public request (verifySession fails closed until loaded).
  const { ensureSessionSecret, loadAuthState } = await import('./lib/auth');
  ensureSessionSecret();
  await loadAuthState();

  const { startServerScheduler } = await import('./lib/server-scheduler');
  startServerScheduler();

  const { startPushSchedule } = await import('./lib/push-schedule');
  startPushSchedule();

  const { startTelegramBotPolling } = await import('./lib/telegram-bot');
  startTelegramBotPolling();

  const { ensureBackupKey } = await import('./lib/backup');
  ensureBackupKey();
  const { startBackupScheduler } = await import('./lib/backup-scheduler');
  startBackupScheduler();
}
