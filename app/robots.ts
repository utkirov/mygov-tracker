import type { MetadataRoute } from 'next';

/** Private tool: nothing here is for search engines (pages also carry noindex). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
