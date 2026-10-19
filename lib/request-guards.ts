import { hostname as osHostname } from 'node:os';

import { isPrivateNetworkAddress } from './app-token';

/** Lowercased host name from a Host header, without the port; IPv6 brackets kept off. */
export function hostNameFromHeader(host: string | null | undefined): string | null {
  if (!host) return null;
  const value = host.trim().toLowerCase();
  if (!value) return null;

  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end > 0 ? value.slice(1, end) : null;
  }

  const colon = value.indexOf(':');
  return colon >= 0 ? value.slice(0, colon) : value;
}

function parseAllowedHostsEnv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * DNS-rebinding guard: a browser tricked into reaching this server through an
 * attacker's domain still sends that domain as Host. Only names that can't be
 * attacker-controlled are accepted — localhost, private-network IP literals and
 * this machine's own name — plus anything listed in APP_ALLOWED_HOSTS
 * (comma-separated, e.g. a Tailscale name).
 */
export function isAllowedHost(
  host: string | null | undefined,
  extraAllowedHosts: string[] = parseAllowedHostsEnv(process.env.APP_ALLOWED_HOSTS),
  machineHostname: string = osHostname()
): boolean {
  const name = hostNameFromHeader(host);
  if (!name) return false;

  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (isPrivateNetworkAddress(name)) return true;

  const machine = machineHostname.trim().toLowerCase();
  if (machine && (name === machine || name === `${machine}.local`)) return true;

  return extraAllowedHosts.includes(name);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for state-changing requests. Browsers attach Origin to every
 * cross-origin POST/PATCH/DELETE (fetch, no-cors or a plain <form>), so a
 * mismatch with Host means another site is driving this browser. Requests with
 * neither Origin nor Sec-Fetch-Site come from non-browser clients (curl,
 * scripts), which can't carry a victim's ambient credentials, and are let
 * through to the normal auth checks.
 */
export function isCrossSiteRequest(
  method: string,
  origin: string | null | undefined,
  secFetchSite: string | null | undefined,
  host: string | null | undefined
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;

  if (origin) {
    if (origin === 'null' || !host) return true;
    try {
      return new URL(origin).host.toLowerCase() !== host.trim().toLowerCase();
    } catch {
      return true;
    }
  }

  if (secFetchSite) {
    return secFetchSite !== 'same-origin' && secFetchSite !== 'none';
  }

  return false;
}
