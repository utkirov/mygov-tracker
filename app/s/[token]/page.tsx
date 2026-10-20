import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { connection } from 'next/server';

import { StageStepper } from '@/components/StageStepper';
import { Card, fmt, ShareApplicationDetails, statusDot } from '@/components/share/ShareApplication';
import { telegramSubscribeUrl } from '@/lib/client-notify';
import {
  buildClientShareView,
  buildShareView,
  findShareLink,
  isShareLinkActive,
  isUnlocked,
  recordShareView,
  unlockCookieName,
} from '@/lib/share-links';

export const metadata: Metadata = {
  title: 'Статус заявления',
  robots: { index: false, follow: false },
};

function Shell({ children, refresh = true }: { children: React.ReactNode; refresh?: boolean }) {
  return (
    <div className="min-h-svh" style={{ background: 'var(--bg)' }}>
      {/* The page refreshes itself so an open tab stays current. */}
      {refresh && <meta httpEquiv="refresh" content="300" />}
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">{children}</div>
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <Shell refresh={false}>
      <Card>
        <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</p>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>{text}</p>
      </Card>
    </Shell>
  );
}

function SubscribeButton({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px] font-semibold"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
      Получать обновления в Telegram
    </a>
  );
}

/**
 * Public, read-only status page behind a client share link (lib/share-links.ts):
 * one application, or every application of a client. No login; works until the
 * link expires or is revoked; a PIN link asks for the PIN first (./unlock).
 */
export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ pin?: string }> }) {
  await connection();
  const { token } = await params;
  const { pin: pinState } = await searchParams;
  const link = await findShareLink(token);
  if (!link) return <Message title="Ссылка не найдена" text="Попросите отправителя прислать новую ссылку." />;
  if (!isShareLinkActive(link)) {
    return <Message title={link.revoked_at ? 'Ссылка отозвана' : 'Срок действия ссылки истёк'} text="Попросите отправителя прислать новую ссылку." />;
  }

  if (!(await isUnlocked(token, (await cookies()).get(unlockCookieName(token))?.value))) {
    return (
      <Shell refresh={false}>
        <Card title="Введите PIN">
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Ссылка защищена PIN-кодом — его сообщил отправитель.</p>
          <form method="post" action={`/s/${token}/unlock`} className="mt-3 flex gap-2">
            <input name="pin" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} required autoFocus autoComplete="one-time-code"
              className="h-10 w-36 rounded-[8px] border px-3 text-[15px] tracking-[0.3em] outline-none"
              style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            <button type="submit" className="rounded-[8px] px-4 text-[13px] font-semibold" style={{ background: 'var(--text)', color: 'var(--surface)' }}>Открыть</button>
          </form>
          {pinState === 'wrong' && <p className="mt-2 text-[12px]" style={{ color: 'var(--danger)' }}>Неверный PIN</p>}
          {pinState === 'locked' && <p className="mt-2 text-[12px]" style={{ color: 'var(--danger)' }}>Слишком много попыток — подождите 15 минут</p>}
        </Card>
      </Shell>
    );
  }

  await recordShareView(token, (await headers()).get('user-agent') ?? '');
  const subscribeHref = await telegramSubscribeUrl(token).catch(() => null);
  const footer = (
    <p className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
      {link.expires_at ? `Ссылка действует до ${fmt(link.expires_at)}` : 'Бессрочная ссылка'} · данные обновляются автоматически
    </p>
  );

  if (link.client_id) {
    const view = await buildClientShareView(link);
    if (!view) return <Message title="Ссылка не найдена" text="Попросите отправителя прислать новую ссылку." />;
    const active = view.applications.filter(a => !a.completed);
    const done = view.applications.filter(a => a.completed);
    const docHref = (appId: string) => (file: string) => `/s/${token}/doc/${file}?app=${encodeURIComponent(appId)}`;
    return (
      <Shell>
        <div className="space-y-4">
          <header>
            <p className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>my.gov.uz · заявления клиента</p>
            <h1 className="mt-1 text-[22px] font-bold leading-[1.25]" style={{ color: 'var(--text)' }}>{view.client_name}</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
              В работе: {active.length} · завершено: {done.length}
            </p>
            <div className="mt-3"><SubscribeButton href={subscribeHref} /></div>
          </header>

          {view.applications.length === 0 && <Card><p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Заявлений пока нет.</p></Card>}

          {[...active, ...done].map(app => (
            <details key={app.id} open={!app.completed && active.length <= 3}
              className="rounded-[14px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <summary className="cursor-pointer list-none p-4 md:p-5">
                <div className="flex items-start gap-2.5">
                  <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: statusDot(app) }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{app.title}</p>
                    <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      № {app.application_number} · {app.status}{app.current_action ? ` · ${app.current_action}` : ''}
                    </p>
                    {!app.completed && app.checklist && app.checklist.progress.length > 0 && (
                      <div className="mt-3"><StageStepper checklist={app.checklist} /></div>
                    )}
                  </div>
                </div>
              </summary>
              <div className="border-t p-3 md:p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <ShareApplicationDetails view={app} docHref={docHref(app.id)} />
              </div>
            </details>
          ))}
          {footer}
        </div>
      </Shell>
    );
  }

  const view = await buildShareView(link);
  if (!view) return <Message title="Ссылка не найдена" text="Попросите отправителя прислать новую ссылку." />;
  return (
    <Shell>
      <div className="space-y-4">
        <header>
          <p className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>my.gov.uz · заявление № {view.application_number}</p>
          <h1 className="mt-1 text-[22px] font-bold leading-[1.25]" style={{ color: 'var(--text)' }}>{view.title}</h1>
          {view.title !== view.service_name && <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>{view.service_name}</p>}
          {view.organization && <p className="mt-0.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>{view.organization}</p>}
          <div className="mt-3"><SubscribeButton href={subscribeHref} /></div>
        </header>
        <ShareApplicationDetails view={view} docHref={file => `/s/${token}/doc/${file}`} />
        {footer}
      </div>
    </Shell>
  );
}
