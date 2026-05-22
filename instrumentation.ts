export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  const { startServerScheduler } = await import('./lib/server-scheduler');
  startServerScheduler();
}
