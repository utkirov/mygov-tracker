/**
 * A PDF opened with «Открыть с помощью → my.gov tracker» (e.g. from Telegram
 * or mail) arrives as a content:// URL. Send it to the add screen instead of
 * letting the router look for a route with that name.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (/^(content|file):\/\//i.test(path)) return `/add?file=${encodeURIComponent(path)}`;
  return path;
}
