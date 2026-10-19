import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // TypeScript configuration
  typescript: {
    tsconfigPath: './tsconfig.json',
    ignoreBuildErrors: false,
  },

  // API responses carry verification passwords, the Telegram bot token and
  // live statuses — never let a browser or shared cache keep them, and never
  // serve a stale list right after a mutation.
  headers: async () => [
    {
      source: '/api/:path*',
      headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
    },
  ],

  // Image optimization
  images: {
    unoptimized: true, // Since we're local-only, can disable remote optimization
  },

  serverExternalPackages: ['better-sqlite3'],

  experimental: {
    // proxy.ts makes Next buffer request bodies, and anything past this limit
    // is silently cut off (default 10 MB) — that broke 10–20 MB PDF uploads and
    // would break APK uploads in Settings → «Приложение Android».
    proxyClientMaxBodySize: '200mb',
  },

  // This checkout lives inside another project's folder (git worktree); without
  // an explicit root Turbopack picks the parent's lockfile as the workspace root.
  turbopack: {
    root: __dirname,
  },

  // Let LAN devices load dev-only assets (HMR, chunks) in `next dev`;
  // without this the page renders but never hydrates on e.g. 192.168.x.x.
  allowedDevOrigins: ['127.0.0.1', '10.*.*.*', '172.*.*.*', '192.168.*.*'],
};

export default nextConfig;
