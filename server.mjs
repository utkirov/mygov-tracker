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
// `node server.mjs --dev`. HOST / PORT env vars override 0.0.0.0:3000.
import { createServer } from 'node:http';

const dev = process.argv.includes('--dev');
process.env.NODE_ENV ??= dev ? 'development' : 'production';
// Tells proxy.ts that x-forwarded-for is the real socket address. Without it
// (e.g. plain `next start`) proxy.ts falls back to token-only auth.
process.env.APP_TRUSTED_CLIENT_IP = '1';

const hostname = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);

const SPOOFABLE_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
  'forwarded',
];

function scrubForwardingHeaders(req) {
  for (const header of SPOOFABLE_HEADERS) {
    delete req.headers[header];
  }
  req.headers['x-forwarded-for'] = req.socket.remoteAddress ?? '';
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
