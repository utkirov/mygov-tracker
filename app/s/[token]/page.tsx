import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { connection } from 'next/server';

import { Card, fmt, ShareApplicationDetails, statusDot } from '@/components/share/ShareApplication';
import { ContactBar, ContactCard, type ShareForecast, TimelineCard } from '@/components/share/ShareChrome';
import { loadAnalytics } from '@/lib/analytics';
import { BRAND } from '@/lib/brand';
import { telegramSubscribeUrl } from '@/lib/client-notify';
import { SESSION_COOKIE, verifySession } from '@/lib/session-token';
import { parseShareLang, SHARE_LANG_COOKIE, shareText, statusLabel, type ShareLang } from '@/lib/share-i18n';
import { parseShareTheme, SHARE_THEME_COOKIE, type ShareTheme } from '@/lib/share-theme';
import {
  buildClientShareView,
  buildShareView,
  findShareLink,
  isShareLinkActive,
  isUnlocked,
  recordShareView,
  unlockCookieName,
} from '@/lib/share-links';

const SHARE_ROBOTS: Metadata['robots'] = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

/**
 * Tab title and the preview card a messenger builds when the link is pasted
 * (Telegram, WhatsApp): number, status and service — never the object name,
 * the client's name or anything behind a PIN. The token never leaves in a
 * Referer header (no-referrer).
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const base: Metadata = {
    robots: SHARE_ROBOTS,
    referrer: 'no-referrer',
    openGraph: { type: 'website', siteName: 'TURON PROJECT', locale: 'ru_RU' },
  };
  const card = (title: string, description: string): Metadata => ({
    ...base,
    title: { absolute: title },
    description,
    openGraph: { ...base.openGraph, title, description },
    // The picture itself comes from ./opengraph-image.tsx.
    twitter: { card: 'summary_large_image', title, description },
  });

  const link = await findShareLink(token);
  if (!link || !isShareLinkActive(link)) return card('Ссылка недоступна', 'Срок действия ссылки истёк или она отозвана.');
  if (link.has_pin) return card('Статус заявления · my.gov.uz', 'Ссылка защищена PIN-кодом — его сообщил отправитель.');

  if (link.client_id) {
    const view = await buildClientShareView(link);
    const active = view?.applications.filter(a => !a.completed).length ?? 0;
    const total = view?.applications.length ?? 0;
    return card('Ваши заявления · my.gov.uz', `В работе: ${active} из ${total}. Статусы и этапы обновляются автоматически.`);
  }
  const view = await buildShareView(link);
  if (!view) return card('Ссылка недоступна', 'Попросите отправителя прислать новую ссылку.');
  return card(
    `Заявление № ${view.application_number} — ${view.status}`,
    [view.service_name, view.organization, 'Статус обновляется автоматически.'].filter(Boolean).join(' · '),
  );
}

/** Cloudflare sends non-ASCII city names percent-encoded or as raw UTF-8 bytes. */
function decodeHeader(value: string | null): string {
  if (!value) return '';
  try {
    return /%[0-9A-F]{2}/i.test(value) ? decodeURIComponent(value) : Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
}

/** TURON PROJECT frame: contacts and the theme icon on top, light or dark colours. */
interface Look { theme: ShareTheme; lang: ShareLang }

function Shell({ children, look, refresh = true }: { children: React.ReactNode; look: Look; refresh?: boolean }) {
  return (
    <div id="share-root" lang={look.lang} className={`share-theme-${look.theme} min-h-svh`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* The page refreshes itself so an open tab stays current. */}
      {refresh && <meta httpEquiv="refresh" content="300" />}
      <ContactBar lang={look.lang} />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">{children}</div>
    </div>
  );
}

function Message({ title, text, look }: { title: string; text: string; look: Look }) {
  return (
    <Shell refresh={false} look={look}>
      <Card>
        <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</p>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>{text}</p>
      </Card>
    </Shell>
  );
}

/** «Подробнее» — the full detail blocks, folded. */
function More({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <details className="rounded-[14px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>
        {text}<span aria-hidden>▾</span>
      </summary>
      <div className="border-t p-3 md:p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>{children}</div>
    </details>
  );
}

function SubscribeButton({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px] font-semibold"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
      {label}
    </a>
  );
}

/**
 * Public, read-only status page behind a client share link (lib/share-links.ts):
 * one application, or every application of a client. No login; works until the
 * link expires or is revoked; a PIN link asks for the PIN first (./unlock).
 */
export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ pin?: string; own?: string }> }) {
  await connection();
  const { token: address } = await params;
  const { pin: pinState, own: ownParam } = await searchParams;
  const jar = await cookies();
  // The owner's own openings don't count: signed in to the tracker, or «Открыть»
  // from the tracker (?own=1 — at worst someone hides their own view with it).
  const owner = ownParam === '1' || !!verifySession(jar.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  // Light / dark: the visitor's choice (the icon in the top bar), else their device theme.
  const h = await headers();
  // Light / dark and RU / UZ: the visitor's choice (top bar), else the device theme and browser language.
  const look: Look = {
    theme: parseShareTheme(jar.get(SHARE_THEME_COOKIE)?.value),
    lang: parseShareLang(jar.get(SHARE_LANG_COOKIE)?.value, h.get('accept-language')),
  };
  const { lang } = look;
  const t = shareText(lang);
  // /s/<slug> and /s/<token> are the same link; PIN form, documents and the
  // unlock cookie always go by the token.
  const link = await findShareLink(address);
  if (!link) return <Message look={look} title={t('notFound')} text={t('askNew')} />;
  if (!isShareLinkActive(link)) {
    return <Message title={link.revoked_at ? t('revoked') : t('expired')} text={t('askNew')} look={look} />;
  }
  const { token } = link;

  if (!(await isUnlocked(token, jar.get(unlockCookieName(token))?.value))) {
    return (
      <Shell refresh={false} look={look}>
        <Card title={t('pinTitle')}>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{t('pinHint')}</p>
          <form method="post" action={`/s/${token}/unlock`} className="mt-3 flex gap-2">
            <input name="pin" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} required autoFocus autoComplete="one-time-code"
              className="h-10 w-36 rounded-[8px] border px-3 text-[15px] tracking-[0.3em] outline-none"
              style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            <button type="submit" className="rounded-[8px] px-4 text-[13px] font-semibold" style={{ background: 'var(--text)', color: 'var(--surface)' }}>{t('open')}</button>
          </form>
          {pinState === 'wrong' && <p className="mt-2 text-[12px]" style={{ color: 'var(--danger)' }}>{t('pinWrong')}</p>}
          {pinState === 'locked' && <p className="mt-2 text-[12px]" style={{ color: 'var(--danger)' }}>{t('pinLocked')}</p>}
        </Card>
      </Shell>
    );
  }

  // Location comes from Cloudflare and is only trusted for tunnel requests
  // (server.mjs sets x-app-via-tunnel only for cloudflared on loopback).
  const viaTunnel = h.get('x-app-via-tunnel') === '1';
  if (!owner) {
    await recordShareView(token, {
      userAgent: h.get('user-agent') ?? '',
      ip: h.get('x-app-client-ip') ?? '',
      country: viaTunnel ? h.get('cf-ipcountry') ?? '' : '',
      city: viaTunnel ? decodeHeader(h.get('cf-ipcity')) : '',
    });
  }
  const subscribeHref = await telegramSubscribeUrl(token).catch(() => null);
  // When the decision is expected — from the tracker's own history of the same service.
  const forecasts = new Map<string, ShareForecast>();
  for (const f of (await loadAnalytics().catch(() => null))?.forecasts ?? []) {
    if (!f.expectedAt || f.stale) continue;
    const at = new Date(f.expectedAt);
    forecasts.set(f.applicationId, {
      date: at.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }),
      soon: at.getTime() < Date.now(),
      late: f.overdueDays !== null,
      typicalDays: f.typicalDays,
    });
  }
  const footer = (
    <>
      <ContactCard lang={lang} />
      <p className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {link.expires_at ? `${t('validUntil')} ${fmt(link.expires_at)}` : t('forever')} · {t('autoUpdate')}
        <br />© {BRAND.company} · <a href={BRAND.site} target="_blank" rel="noopener noreferrer" className="hover:underline">turonproject.uz</a>
      </p>
    </>
  );

  if (link.client_id) {
    const view = await buildClientShareView(link);
    if (!view) return <Message look={look} title={t('notFound')} text={t('askNew')} />;
    const active = view.applications.filter(a => !a.completed);
    const done = view.applications.filter(a => a.completed);
    const docHref = (appId: string) => (file: string) => `/s/${token}/doc/${file}?app=${encodeURIComponent(appId)}`;
      return (
        <Shell look={look}>
          <div className="space-y-4">
            <header>
              <p className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>{t('clientApps')}</p>
              <h1 className="mt-1 text-[24px] font-bold leading-[1.2]" style={{ color: 'var(--text)' }}>{view.client_name}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-semibold">
                <span className="rounded-full px-3 py-1" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{t('inWorkCount')}: {active.length}</span>
                <span className="rounded-full px-3 py-1" style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}>{t('doneCount')}: {done.length}</span>
              </div>
              <div className="mt-3"><SubscribeButton href={subscribeHref} label={t('subscribe')} /></div>
            </header>
            {view.applications.length === 0 && <Card><p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{t('noApps')}</p></Card>}
            {active.map(app => (
              <div key={app.id} className="space-y-2">
                <TimelineCard view={app} lang={lang} forecast={forecasts.get(app.id)} />
                <More text={t('more')}>
                  <ShareApplicationDetails view={app} docHref={docHref(app.id)} lang={lang} />
                </More>
              </div>
            ))}
            {done.length > 0 && <p className="pt-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('finishedList')}</p>}
            {done.map(app => (
              <details key={app.id} className="rounded-[14px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <summary className="flex cursor-pointer list-none items-center gap-2.5 p-4">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: statusDot(app) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{app.title}</span>
                    <span className="block text-[12px]" style={{ color: 'var(--text-muted)' }}>№ {app.application_number} · {statusLabel(lang, app.status)} · {fmt(app.last_changed_date).slice(0, 10)}</span>
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>{t('open')}</span>
                </summary>
                <div className="space-y-3 border-t p-3 md:p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  <TimelineCard view={app} lang={lang} forecast={forecasts.get(app.id)} />
                  <ShareApplicationDetails view={app} docHref={docHref(app.id)} lang={lang} />
                </div>
              </details>
            ))}
            {footer}
          </div>
        </Shell>
      );
  }

  const view = await buildShareView(link);
  if (!view) return <Message look={look} title={t('notFound')} text={t('askNew')} />;
    return (
      <Shell look={look}>
        <div className="space-y-4">
          <TimelineCard view={view} lang={lang} forecast={forecasts.get(view.id)} />
          <div><SubscribeButton href={subscribeHref} label={t('subscribe')} /></div>
          <More text={t('more')}>
            <ShareApplicationDetails view={view} docHref={file => `/s/${token}/doc/${file}`} lang={lang} />
          </More>
          {footer}
        </div>
      </Shell>
    );
}
