// Custom Next.js server (see node_modules/next/dist/docs/01-app/02-guides/custom-server.md).
//
// Why not plain `next start`: proxy.ts trusts LAN clients by their IP, and the
// only IP it can see is the `x-forwarded-for` header. Next's built-in server
// fills that header with `??=` — i.e. it keeps whatever the client sent — so
// any client could claim `X-Forwarded-For: 127.0.0.1` and skip the token. This
// server sits directly on the socket (there's no reverse proxy in front of
// this app), drops every client-supplied forwarding header and sets
// `x-forwarded-for` to the real socket address before Next sees the request.
//
// Usage: `node server.mjs` (production, needs `next build`) or
// `node server.mjs --dev`. HOST / PORT env vars override 0.0.0.0:3040.
import { createServer } from 'node:http';

const dev = process.argv.includes('--dev');
process.env.NODE_ENV ??= dev ? 'development' : 'production';
// Tells proxy.ts that x-forwarded-for is the real socket address. Without it
// (e.g. plain `next start`) proxy.ts falls back to token-only auth.
process.env.APP_TRUSTED_CLIENT_IP = '1';

const hostname = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3040', 10);

const SPOOFABLE_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
  'forwarded',
  'x-app-via-tunnel',
  'x-app-client-ip',
];

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Cloudflare Tunnel: cloudflared runs on this machine and connects from
// loopback, adding `cf-connecting-ip` with the real visitor address. That
// header is only believed when the socket itself is loopback — anyone on the
// LAN sending it directly gets it stripped. proxy.ts treats tunnel requests
// as public (login required) and rate-limits by x-app-client-ip.
function scrubForwardingHeaders(req) {
  const socketIp = req.socket.remoteAddress ?? '';
  const cfIp = req.headers['cf-connecting-ip'];
  for (const header of SPOOFABLE_HEADERS) {
    delete req.headers[header];
  }
  req.headers['x-forwarded-for'] = socketIp;
  if (LOOPBACK.has(socketIp) && typeof cfIp === 'string' && cfIp) {
    req.headers['x-app-via-tunnel'] = '1';
    req.headers['x-app-client-ip'] = cfIp;
  } else {
    delete req.headers['cf-connecting-ip'];
    req.headers['x-app-client-ip'] = socketIp;
  }
}

// A restore chosen in Settings is staged by the previous run; swap the files in
// now, before anything opens the database.
{
  const { createRequire } = await import('node:module');
  const { join, resolve } = await import('node:path');
  const { applyPendingRestore } = createRequire(import.meta.url)('./scripts/apply-pending-restore.cjs');
  const root = process.env.LOCAL_APP_ROOT?.trim() ? resolve(process.env.LOCAL_APP_ROOT.trim()) : process.cwd();
  try {
    applyPendingRestore(join(root, 'data'));
  } catch (error) {
    console.error('[restore] failed to apply the pending restore:', error);
  }
}

// Imported after NODE_ENV is set — Next reads it while loading.
const { default: next } = await import('next');

const httpServer = createServer();
const app = next({ dev, hostname, port, httpServer });
const handle = app.getRequestHandler();

await app.prepare();

httpServer.on('request', (req, res) => {
  scrubForwardingHeaders(req);
  handle(req, res);
});

httpServer.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port} (${dev ? 'development' : 'production'})`);
});
