/**
 * Picture cards (PNG, next/og ImageResponse):
 *   • linkPreviewImage — the preview a messenger shows for a share link /s/<…>
 *   • accessCard       — «Доступ»: project, application number, check password
 *   • progressCard     — «Ход заявления»: title, number, submitted / changed dates,
 *                        days in work, current stage
 * The two cards are sent from the app or the site (Telegram, WhatsApp…) by the
 * owner; the preview is public, so it shows only what the share page shows.
 * Fonts: Inter (OFL, assets/fonts) — the bundled og font has no Cyrillic.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ImageResponse } from 'next/og';

const C = {
  bg: '#F7F7F8', surface: '#FFFFFF', text: '#111113', soft: '#3F3F46', muted: '#71717A', border: '#E4E4E7',
  accent: '#2563EB', ok: '#16A34A', warn: '#CA8A04', bad: '#DC2626',
};

let fontsPromise: Promise<Array<{ name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }>> | null = null;
function fonts() {
  fontsPromise ??= Promise.all(([[400, 'Regular'], [600, 'SemiBold'], [700, 'Bold']] as const).map(async ([weight, name]) => ({
    name: 'Inter',
    data: await readFile(path.join(process.cwd(), 'assets', 'fonts', `Inter_${weight}${name}.ttf`)),
    weight,
    style: 'normal' as const,
  })));
  return fontsPromise;
}

export function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (/отказ|отклон|аннулир|rad/.test(s)) return C.bad;
  if (/обработано|выдан|исполнено|tasdiq|ijobiy/.test(s)) return C.ok;
  if (/ждёт|ожида|заявител/.test(s)) return C.warn;
  return C.accent;
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Tashkent' });
}

/** Whole days from submission to the end (finished) or to now. */
export function daysInWork(submitted: string | null | undefined, end: string | null | undefined, now = new Date()): number | null {
  if (!submitted) return null;
  const from = Date.parse(submitted);
  const to = end ? Date.parse(end) : now.getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

export function daysWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function Brand({ right }: { right?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', width: 52, height: 52, borderRadius: 12, background: C.text, color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>mg</div>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: C.text }}>my.gov tracker</div>
      </div>
      {right ? <div style={{ display: 'flex', fontSize: 22, color: C.muted }}>{right}</div> : null}
    </div>
  );
}

function Status({ status, size = 30 }: { status: string; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', width: size * 0.5, height: size * 0.5, borderRadius: 999, background: statusColor(status) }} />
      <div style={{ display: 'flex', fontSize: size, fontWeight: 600, color: C.text }}>{status || '—'}</div>
    </div>
  );
}

function Field({ label, value, big, mono }: { label: string; value: string; big?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <div style={{ display: 'flex', fontSize: 20, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ display: 'flex', fontSize: big ? 52 : 34, fontWeight: 700, color: C.text, letterSpacing: mono ? 2 : 0 }}>{value}</div>
    </div>
  );
}

function Frame({ children, width, height }: { children: React.ReactNode; width: number; height: number }) {
  return (
    <div style={{ display: 'flex', width, height, background: C.bg, padding: 40, fontFamily: 'Inter' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', background: C.surface, borderRadius: 28, border: `2px solid ${C.border}`, padding: '44px 52px' }}>
        {children}
      </div>
    </div>
  );
}

async function render(node: React.ReactElement, width: number, height: number): Promise<ImageResponse> {
  return new ImageResponse(node, { width, height, fonts: await fonts() });
}

// ── public preview of a share link ──

export const PREVIEW_SIZE = { width: 1200, height: 630 };

export async function linkPreviewImage(input:
  | { kind: 'application'; number: string; status: string; service: string; stage: string; stageLine: string }
  | { kind: 'client'; active: number; total: number }
  | { kind: 'generic'; text: string },
): Promise<ImageResponse> {
  const { width, height } = PREVIEW_SIZE;
  let body: React.ReactNode;
  if (input.kind === 'application') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', fontSize: 30, color: C.muted }}>Заявление № {input.number}</div>
        <Status status={input.status} size={54} />
        <div style={{ display: 'flex', fontSize: 30, color: C.soft, lineHeight: 1.3 }}>{clip(input.service, 110)}</div>
        {input.stage ? <div style={{ display: 'flex', fontSize: 26, color: C.muted }}>{clip(`${input.stageLine}: ${input.stage}`, 80)}</div> : null}
      </div>
    );
  } else if (input.kind === 'client') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: C.text }}>Ваши заявления</div>
        <div style={{ display: 'flex', fontSize: 34, color: C.soft }}>В работе: {input.active} из {input.total}</div>
      </div>
    );
  } else {
    body = <div style={{ display: 'flex', fontSize: 48, fontWeight: 700, color: C.text }}>{input.text}</div>;
  }
  return render(
    <Frame width={width} height={height}>
      <Brand right="my.gov.uz" />
      {body}
      <div style={{ display: 'flex', fontSize: 22, color: C.muted }}>Статус обновляется автоматически</div>
    </Frame>,
    width, height,
  );
}

// ── cards the owner sends ──

export const CARD_SIZE = { width: 1200, height: 800 };

export async function accessCard(input: { project: string; title: string; number: string; password: string }): Promise<ImageResponse> {
  const { width, height } = CARD_SIZE;
  return render(
    <Frame width={width} height={height}>
      <Brand right="Доступ к заявлению" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', fontSize: 20, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{input.project ? 'Проект' : 'Объект'}</div>
        <div style={{ display: 'flex', fontSize: 48, fontWeight: 700, color: C.text, lineHeight: 1.15 }}>{clip(input.project || input.title, 60)}</div>
        {input.project && input.title && input.project !== input.title
          ? <div style={{ display: 'flex', fontSize: 28, color: C.soft }}>{clip(input.title, 80)}</div> : null}
      </div>
      <div style={{ display: 'flex', gap: 32, padding: '28px 32px', borderRadius: 20, background: C.bg }}>
        <Field label="Номер заявки" value={input.number} big mono />
        <Field label="Пароль проверки" value={input.password || '—'} big mono />
      </div>
      <div style={{ display: 'flex', fontSize: 22, color: C.muted }}>my.gov.uz → «Проверить статус заявления» → номер и пароль</div>
    </Frame>,
    width, height,
  );
}

export async function progressCard(input: {
  title: string; service: string; number: string; status: string;
  submitted: string; changed: string; days: number | null; stage: string; stageLine: string; completed: boolean;
}): Promise<ImageResponse> {
  const { width, height } = CARD_SIZE;
  return render(
    <Frame width={width} height={height}>
      <Brand right={`№ ${input.number}`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', fontSize: 46, fontWeight: 700, color: C.text, lineHeight: 1.15 }}>{clip(input.title, 70)}</div>
        {input.service && input.service !== input.title
          ? <div style={{ display: 'flex', fontSize: 26, color: C.soft }}>{clip(input.service, 95)}</div> : null}
        <Status status={input.status} size={34} />
      </div>
      <div style={{ display: 'flex', gap: 24, padding: '26px 30px', borderRadius: 20, background: C.bg }}>
        <Field label="Подано" value={input.submitted} />
        <Field label="Изменено" value={input.changed} />
        <Field label={input.completed ? 'Шло' : 'В работе'} value={input.days === null ? '—' : `${input.days} ${daysWord(input.days)}`} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', fontSize: 20, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{input.stageLine}</div>
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, color: C.text }}>{clip(input.stage || '—', 70)}</div>
      </div>
    </Frame>,
    width, height,
  );
}
