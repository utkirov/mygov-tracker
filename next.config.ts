import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',

  // TypeScript configuration
  typescript: {
    tsconfigPath: './tsconfig.json',
    ignoreBuildErrors: false,
  },

  // Enable SWR caching for API responses
  headers: async () => [
    {
      source: '/api/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=60, stale-while-revalidate=120',
        },
      ],
    },
  ],

  // Image optimization
  images: {
    unoptimized: true, // Since we're local-only, can disable remote optimization
  },

  // Experimental optimizations
  experimental: {
    optimizePackageImports: ['@/lib', '@/components'],
  },
};

export default nextConfig;
