export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  const { ensureAppToken } = await import('./lib/app-token');
  ensureAppToken();

  const { startServerScheduler } = await import('./lib/server-scheduler');
  startServerScheduler();

  const { startTelegramBotPolling } = await import('./lib/telegram-bot');
  startTelegramBotPolling();
}
