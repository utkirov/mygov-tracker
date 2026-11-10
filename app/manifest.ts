import type { MetadataRoute } from 'next';

/** «Install app» / «Add to home screen» from the browser — name, colours and icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TURON PROJECT Application Tracker',
    short_name: 'TURON Tracker',
    description: 'Отслеживание заявлений my.gov.uz: статусы, согласования, документы и уведомления.',
    lang: 'ru',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#F3F1EC',
    theme_color: '#7C4DFF',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
