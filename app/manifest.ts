import type { MetadataRoute } from 'next';

/** «Install app» / «Add to home screen» from the browser — name, colours and icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'my.gov tracker',
    short_name: 'Tracker',
    description: 'Отслеживание заявлений my.gov.uz: статусы, согласования, документы и уведомления.',
    lang: 'ru',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#F7F7F8',
    theme_color: '#111113',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
