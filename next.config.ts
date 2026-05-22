import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // TypeScript configuration
  typescript: {
    tsconfigPath: './tsconfig.json',
    ignoreBuildErrors: false,
  },

  // Cache strategy for API responses
  // Development: no caching to prevent stale data during testing
  // Production: conservative SWR to handle brief network hiccups without causing data inconsistency
  headers: async () => {
    const cacheValue = process.env.NODE_ENV === 'development'
      ? 'public, max-age=0, no-cache'
      : 'public, max-age=60, stale-while-revalidate=120';

    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: cacheValue }],
      },
    ];
  },

  // Image optimization
  images: {
    unoptimized: true, // Since we're local-only, can disable remote optimization
  },

  serverExternalPackages: ['better-sqlite3'],

  // Experimental optimizations
  experimental: {
    optimizePackageImports: ['@/lib', '@/components'],
  },
};

export default nextConfig;
