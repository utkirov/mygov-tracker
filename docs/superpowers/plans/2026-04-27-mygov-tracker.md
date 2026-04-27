# my.gov.uz Application Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal responsive web app that tracks government applications submitted via my.gov.uz — import via PDF, auto-check status without ЭЦП.

**Architecture:** Next.js 14 App Router on Vercel (free tier) with Supabase PostgreSQL as database. PDF parsing runs in a serverless API route using `pdf-parse`. Status checks scrape the my.gov.uz public status page (no auth required) using `cheerio` + native `fetch`.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase JS, pdf-parse, cheerio (PIN auth via HttpOnly cookie)

---

## File Map

```
crm-invoices/
├── app/
│   ├── layout.tsx                        # Root layout, wraps all pages
│   ├── login/
│   │   └── page.tsx                      # PIN login page
│   ├── dashboard/
│   │   └── page.tsx                      # Main screen — list of applications
│   ├── add/
│   │   └── page.tsx                      # PDF upload page
│   ├── applications/
│   │   └── [id]/
│   │       └── page.tsx                  # Application detail + status history
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts            # POST — verify PIN, set cookie
│       │   └── logout/route.ts           # POST — clear cookie
│       ├── applications/
│       │   ├── route.ts                  # GET (list), POST (create)
│       │   ├── parse-pdf/route.ts        # POST — parse PDF buffer, return fields
│       │   └── [id]/
│       │       ├── route.ts              # GET (detail), PATCH (update notes)
│       │       └── check/route.ts        # POST — scrape my.gov.uz, update status
├── components/
│   ├── ApplicationCard.tsx               # Dashboard card with status badge
│   ├── StatusBadge.tsx                   # Colored badge by status type
│   ├── StatusHistory.tsx                 # Timeline of status changes
│   └── PdfUpload.tsx                     # Drag-and-drop PDF zone
├── lib/
│   ├── supabase.ts                       # Supabase server client
│   ├── pdf-parser.ts                     # Parse PDF text → application fields
│   └── status-checker.ts                # Fetch + parse my.gov.uz status page
├── middleware.ts                         # Redirect unauthenticated users to /login
├── types/index.ts                        # Shared TypeScript types
└── supabase/migrations/
    └── 001_initial.sql                   # Create applications + status_history tables
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `.env.local`, `.gitignore`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd D:/utkirov/work/2026/AI/crm-invoices
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

Expected: project files created, `npm run dev` starts on port 3000.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js pdf-parse cheerio
npm install -D @types/pdf-parse @types/cheerio
```

- [ ] **Step 3: Create `.env.local`**

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
APP_PIN=1234
```

Get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase dashboard → Project Settings → API.

- [ ] **Step 4: Add `.superpowers/` to `.gitignore`**

Append to `.gitignore`:
```
.superpowers/
.env.local
```

- [ ] **Step 5: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js project with dependencies"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `types/index.ts`

- [ ] **Step 1: Write types**

```typescript
// types/index.ts
export interface Application {
  id: string;
  application_number: string;
  service_name: string;
  organization: string;
  status: string;
  submission_date: string | null;
  last_changed_date: string | null;
  current_action: string;
  acting_party: string;
  verification_password: string;
  sms_phone: string;
  notes: string;
  pdf_filename: string;
  created_at: string;
  updated_at: string;
}

export interface StatusHistory {
  id: string;
  application_id: string;
  status: string;
  current_action: string;
  acting_party: string;
  recorded_at: string;
}

export interface ParsedPdf {
  application_number: string;
  service_name: string;
  organization: string;
  status: string;
  submission_date: string;
  last_changed_date: string;
  current_action: string;
  acting_party: string;
  verification_password: string;
  sms_phone: string;
}

export type StatusType = 'action_required' | 'in_progress' | 'completed';

export function getStatusType(acting_party: string, status: string): StatusType {
  const terminalStatuses = ['одобрено', 'завершено', 'выдано', 'отказано'];
  if (terminalStatuses.some(s => status.toLowerCase().includes(s))) return 'completed';
  if (acting_party.toLowerCase().includes('заявитель')) return 'action_required';
  return 'in_progress';
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Database Setup

**Files:**
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- supabase/migrations/001_initial.sql
create extension if not exists "pgcrypto";

create table applications (
  id uuid primary key default gen_random_uuid(),
  application_number text unique not null,
  service_name text not null default '',
  organization text not null default '',
  status text not null default '',
  submission_date timestamptz,
  last_changed_date timestamptz,
  current_action text not null default '',
  acting_party text not null default '',
  verification_password text not null default '',
  sms_phone text not null default '',
  notes text not null default '',
  pdf_filename text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  status text not null,
  current_action text not null default '',
  acting_party text not null default '',
  recorded_at timestamptz not null default now()
);

create index on status_history(application_id);
```

- [ ] **Step 2: Run migration in Supabase**

Go to Supabase dashboard → SQL Editor → paste the SQL above → Run.

Verify: both tables appear in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add database migration for applications and status_history"
```

---

## Task 4: Supabase Client + Auth

**Files:**
- Create: `lib/supabase.ts`
- Create: `middleware.ts`
- Create: `app/login/page.tsx`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`

- [ ] **Step 1: Create Supabase server client**

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

- [ ] **Step 2: Create middleware**

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = request.cookies.get('app_session')?.value;
  if (session !== process.env.APP_PIN) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 4: Create login API route**

```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { pin } = await request.json();

  if (pin !== process.env.APP_PIN) {
    return NextResponse.json({ error: 'Неверный PIN' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('app_session', pin, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
```

- [ ] **Step 5: Create logout API route**

```typescript
// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('app_session', '', { maxAge: 0, path: '/' });
  return response;
}
```

- [ ] **Step 6: Create login page**

```tsx
// app/login/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      setError('Неверный PIN-код');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">my.gov tracker</h1>
        <p className="text-gray-500 text-center text-sm mb-6">Введите PIN-код для входа</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="PIN-код"
            className="border rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="bg-blue-600 text-white rounded-lg py-3 font-semibold hover:bg-blue-700 transition"
          >
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Update root layout to redirect `/` to `/dashboard`**

```tsx
// app/page.tsx
import { redirect } from 'next/navigation';
export default function Home() {
  redirect('/dashboard');
}
```

- [ ] **Step 8: Test auth flow manually**

```bash
npm run dev
```

1. Open http://localhost:3000 — should redirect to `/login`
2. Enter wrong PIN — should show "Неверный PIN-код"
3. Enter correct PIN (value of APP_PIN in `.env.local`) — should redirect to `/dashboard` (404 is fine at this point)

- [ ] **Step 9: Commit**

```bash
git add app/ lib/supabase.ts lib/auth.ts middleware.ts
git commit -m "feat: add PIN auth with middleware and login page"
```

---

## Task 5: PDF Parser

**Files:**
- Create: `lib/pdf-parser.ts`
- Create: `lib/__tests__/pdf-parser.test.ts`

- [ ] **Step 1: Install Jest for testing**

```bash
npm install -D jest @types/jest ts-jest
```

Add to `package.json`:
```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/$1"
  }
},
"scripts": {
  "test": "jest"
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// lib/__tests__/pdf-parser.test.ts
import { extractFieldsFromText } from '../pdf-parser';

const SAMPLE_TEXT = `
Номер заявки                285680359
Состояние                   В ожидании оплаты
Дата подачи                 27.04.2026 09:18
Дата последнего изменения   27.04.2026 09:18
Наименование услуги         Подача заявления на согласование проектно-сметной документации по городу Ташкент
Организация                 Министерство строительства и жилищно-коммунального хозяйства Республики Узбекистан
Текущее действие            Оплата
На данный момент действует  Заявитель
Пароль для проверки         73392
Номер телефона для SMS-уведомления  998335008200
`;

describe('extractFieldsFromText', () => {
  it('extracts application number', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.application_number).toBe('285680359');
  });

  it('extracts service name', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.service_name).toContain('согласование проектно-сметной документации');
  });

  it('extracts organization', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.organization).toContain('Министерство строительства');
  });

  it('extracts status', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.status).toBe('В ожидании оплаты');
  });

  it('extracts verification password', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.verification_password).toBe('73392');
  });

  it('extracts acting party', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.acting_party).toBe('Заявитель');
  });

  it('extracts sms phone', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.sms_phone).toBe('998335008200');
  });

  it('returns empty strings for missing fields', () => {
    const result = extractFieldsFromText('no matching content here');
    expect(result.application_number).toBe('');
    expect(result.status).toBe('');
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npm test -- lib/__tests__/pdf-parser.test.ts
```

Expected: `Cannot find module '../pdf-parser'`

- [ ] **Step 4: Implement PDF parser**

```typescript
// lib/pdf-parser.ts
import pdf from 'pdf-parse';
import type { ParsedPdf } from '@/types';

function extractLine(text: string, label: string): string {
  // Match label followed by whitespace and capture the rest of the line
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}\\s{2,}(.+?)(?=\\n|$)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() ?? '';
}

export function extractFieldsFromText(text: string): ParsedPdf {
  return {
    application_number: extractLine(text, 'Номер заявки'),
    service_name: extractLine(text, 'Наименование услуги'),
    organization: extractLine(text, 'Организация'),
    status: extractLine(text, 'Состояние'),
    submission_date: extractLine(text, 'Дата подачи'),
    last_changed_date: extractLine(text, 'Дата последнего изменения'),
    current_action: extractLine(text, 'Текущее действие'),
    acting_party: extractLine(text, 'На данный момент действует'),
    verification_password: extractLine(text, 'Пароль для проверки'),
    sms_phone: extractLine(text, 'Номер телефона для SMS-уведомления'),
  };
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedPdf> {
  const data = await pdf(buffer);
  return extractFieldsFromText(data.text);
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -- lib/__tests__/pdf-parser.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf-parser.ts lib/__tests__/pdf-parser.test.ts
git commit -m "feat: add PDF parser with tests"
```

---

## Task 6: Status Checker

**Files:**
- Create: `lib/status-checker.ts`
- Create: `lib/__tests__/status-checker.test.ts`

- [ ] **Step 1: Write failing tests for status type logic**

```typescript
// lib/__tests__/status-checker.test.ts
import { parseStatusPage, buildStatusCheckUrl } from '../status-checker';

describe('buildStatusCheckUrl', () => {
  it('builds correct URL with number and password', () => {
    const url = buildStatusCheckUrl('285680359', '73392');
    expect(url).toContain('285680359');
    expect(url).toContain('73392');
  });
});

describe('parseStatusPage', () => {
  const sampleHtml = `
    <html><body>
      <table>
        <tr><td>Состояние</td><td>В ожидании оплаты</td></tr>
        <tr><td>Текущее действие</td><td>Оплата</td></tr>
        <tr><td>На данный момент действует</td><td>Заявитель</td></tr>
        <tr><td>Дата последнего изменения</td><td>27.04.2026 10:45</td></tr>
      </table>
    </body></html>
  `;

  it('extracts status from table', () => {
    const result = parseStatusPage(sampleHtml);
    expect(result.status).toBe('В ожидании оплаты');
  });

  it('extracts current action', () => {
    const result = parseStatusPage(sampleHtml);
    expect(result.current_action).toBe('Оплата');
  });

  it('extracts acting party', () => {
    const result = parseStatusPage(sampleHtml);
    expect(result.acting_party).toBe('Заявитель');
  });

  it('returns null for unrecognized HTML structure', () => {
    const result = parseStatusPage('<html><body>Not found</body></html>');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- lib/__tests__/status-checker.test.ts
```

Expected: `Cannot find module '../status-checker'`

- [ ] **Step 3: Implement status checker**

```typescript
// lib/status-checker.ts
import * as cheerio from 'cheerio';

// IMPORTANT: Verify this URL by opening my.gov.uz and checking the public
// application status page URL structure. Update if different.
const STATUS_CHECK_BASE = 'https://my.gov.uz/ru/service/appeal/status';

export interface CheckedStatus {
  status: string;
  current_action: string;
  acting_party: string;
  last_changed_date: string;
}

export function buildStatusCheckUrl(applicationNumber: string, password: string): string {
  const params = new URLSearchParams({ number: applicationNumber, password });
  return `${STATUS_CHECK_BASE}?${params.toString()}`;
}

export function parseStatusPage(html: string): CheckedStatus | null {
  const $ = cheerio.load(html);

  function findByLabel(label: string): string {
    let value = '';
    $('td, th').each((_, el) => {
      const text = $(el).text().trim();
      if (text === label) {
        value = $(el).next('td').text().trim();
        return false; // break
      }
    });
    return value;
  }

  const status = findByLabel('Состояние');
  if (!status) return null;

  return {
    status,
    current_action: findByLabel('Текущее действие'),
    acting_party: findByLabel('На данный момент действует'),
    last_changed_date: findByLabel('Дата последнего изменения'),
  };
}

export async function fetchApplicationStatus(
  applicationNumber: string,
  verificationPassword: string
): Promise<CheckedStatus | null> {
  const url = buildStatusCheckUrl(applicationNumber, verificationPassword);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ApplicationTracker/1.0)',
      Accept: 'text/html',
    },
  });

  if (!response.ok) return null;

  const html = await response.text();
  return parseStatusPage(html);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- lib/__tests__/status-checker.test.ts
```

Expected: all tests pass.

> **Note:** The `fetchApplicationStatus` function makes a real HTTP call to my.gov.uz. After completing Task 8 (the API routes), do a live test by calling the `/api/applications/[id]/check` endpoint manually with a real application number and password. If the parsed result returns `null`, inspect the actual HTML of the status page and update `parseStatusPage` to match its real structure.

- [ ] **Step 5: Commit**

```bash
git add lib/status-checker.ts lib/__tests__/status-checker.test.ts
git commit -m "feat: add my.gov.uz status checker with cheerio parser"
```

---

## Task 7: Application API Routes

**Files:**
- Create: `app/api/applications/route.ts`
- Create: `app/api/applications/parse-pdf/route.ts`
- Create: `app/api/applications/[id]/route.ts`
- Create: `app/api/applications/[id]/check/route.ts`

- [ ] **Step 1: Create list + create route**

```typescript
// app/api/applications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { data, error } = await supabase
    .from('applications')
    .insert([body])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Record initial status in history
  await supabase.from('status_history').insert([{
    application_id: data.id,
    status: data.status,
    current_action: data.current_action,
    acting_party: data.acting_party,
  }]);

  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Create PDF parse route**

```typescript
// app/api/applications/parse-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { parsePdfBuffer } from '@/lib/pdf-parser';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fields = await parsePdfBuffer(buffer);

  return NextResponse.json({ fields, filename: file.name });
}
```

- [ ] **Step 3: Create detail + update route**

```typescript
// app/api/applications/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data: app, error } = await supabase
    .from('applications')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: history } = await supabase
    .from('status_history')
    .select('*')
    .eq('application_id', params.id)
    .order('recorded_at', { ascending: false });

  return NextResponse.json({ application: app, history: history ?? [] });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { notes } = await request.json();

  const { data, error } = await supabase
    .from('applications')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 4: Create status check route**

```typescript
// app/api/applications/[id]/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchApplicationStatus } from '@/lib/status-checker';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { data: app, error } = await supabase
    .from('applications')
    .select('application_number, verification_password, status')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

  const checked = await fetchApplicationStatus(app.application_number, app.verification_password);
  if (!checked) {
    return NextResponse.json({ error: 'Не удалось получить статус с my.gov.uz' }, { status: 502 });
  }

  const statusChanged = checked.status !== app.status;

  if (statusChanged) {
    await supabase.from('status_history').insert([{
      application_id: params.id,
      status: checked.status,
      current_action: checked.current_action,
      acting_party: checked.acting_party,
    }]);
  }

  const { data: updated } = await supabase
    .from('applications')
    .update({
      status: checked.status,
      current_action: checked.current_action,
      acting_party: checked.acting_party,
      last_changed_date: checked.last_changed_date || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single();

  return NextResponse.json({ application: updated, statusChanged });
}
```

- [ ] **Step 5: Test API manually**

```bash
npm run dev
```

Test with curl (replace IDs after adding data in Task 8):
```bash
# List applications (should return [])
curl http://localhost:3000/api/applications

# Parse a PDF (replace path with a real my.gov.uz PDF)
curl -X POST http://localhost:3000/api/applications/parse-pdf \
  -F "file=@/path/to/application.pdf"
```

- [ ] **Step 6: Commit**

```bash
git add app/api/
git commit -m "feat: add application CRUD and status check API routes"
```

---

## Task 8: Shared UI Components

**Files:**
- Create: `components/StatusBadge.tsx`
- Create: `components/ApplicationCard.tsx`
- Create: `components/StatusHistory.tsx`
- Create: `components/PdfUpload.tsx`

- [ ] **Step 1: Create StatusBadge**

```tsx
// components/StatusBadge.tsx
import { getStatusType } from '@/types';

interface Props {
  status: string;
  acting_party: string;
}

export function StatusBadge({ status, acting_party }: Props) {
  const type = getStatusType(acting_party, status);

  const styles = {
    action_required: 'bg-red-100 text-red-700',
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-700',
  };

  const icons = {
    action_required: '⚠ ',
    in_progress: '',
    completed: '✓ ',
  };

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${styles[type]}`}>
      {icons[type]}{status}
    </span>
  );
}
```

- [ ] **Step 2: Create ApplicationCard**

```tsx
// components/ApplicationCard.tsx
'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Application } from '@/types';
import { getStatusType } from '@/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  application: Application;
  onStatusUpdated: (updated: Application) => void;
}

export function ApplicationCard({ application, onStatusUpdated }: Props) {
  const [checking, setChecking] = useState(false);
  const type = getStatusType(application.acting_party, application.status);

  const borderStyle = {
    action_required: 'border-red-300 bg-red-50',
    in_progress: 'border-gray-200 bg-white',
    completed: 'border-green-200 bg-green-50 opacity-80',
  }[type];

  async function handleCheck(e: React.MouseEvent) {
    e.preventDefault();
    setChecking(true);
    const res = await fetch(`/api/applications/${application.id}/check`, { method: 'POST' });
    if (res.ok) {
      const { application: updated } = await res.json();
      onStatusUpdated(updated);
    }
    setChecking(false);
  }

  return (
    <Link href={`/applications/${application.id}`}>
      <div className={`border rounded-xl p-4 cursor-pointer hover:shadow-sm transition ${borderStyle}`}>
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-400 font-mono">№ {application.application_number}</div>
            <div className="text-sm font-semibold text-gray-900 mt-1 line-clamp-2">{application.service_name}</div>
            <div className="text-xs text-gray-500 mt-1">{application.organization}</div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusBadge status={application.status} acting_party={application.acting_party} />
            {application.current_action && (
              <div className="text-xs text-gray-500">{application.current_action}</div>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center mt-3">
          <div className="text-xs text-gray-400">
            {application.last_changed_date
              ? new Date(application.last_changed_date).toLocaleDateString('ru-RU')
              : new Date(application.submission_date ?? application.created_at).toLocaleDateString('ru-RU')}
          </div>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="text-xs border border-gray-300 px-3 py-1 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
          >
            {checking ? '...' : '↻ Проверить'}
          </button>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Create StatusHistory**

```tsx
// components/StatusHistory.tsx
import type { StatusHistory as TStatusHistory } from '@/types';
import { getStatusType } from '@/types';

interface Props {
  history: TStatusHistory[];
}

export function StatusHistory({ history }: Props) {
  if (history.length === 0) return <p className="text-sm text-gray-400">История статусов пуста</p>;

  return (
    <div className="flex flex-col gap-3">
      {history.map((entry, i) => {
        const type = getStatusType(entry.acting_party, entry.status);
        const dotColor = {
          action_required: 'bg-red-500',
          in_progress: 'bg-yellow-400',
          completed: 'bg-green-500',
        }[type];

        return (
          <div key={entry.id} className="flex items-start gap-3">
            <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${i === 0 ? dotColor : 'bg-gray-300'}`} />
            <div>
              <div className={`text-sm font-medium ${i === 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                {entry.status}
              </div>
              {entry.current_action && (
                <div className="text-xs text-gray-400">{entry.current_action}</div>
              )}
              <div className="text-xs text-gray-400 mt-0.5">
                {new Date(entry.recorded_at).toLocaleString('ru-RU')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create PdfUpload**

```tsx
// components/PdfUpload.tsx
'use client';
import { useRef, useState } from 'react';
import type { ParsedPdf } from '@/types';

interface Props {
  onParsed: (fields: ParsedPdf, filename: string) => void;
}

export function PdfUpload({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    if (!file.name.endsWith('.pdf')) {
      setError('Выберите PDF файл');
      return;
    }
    setError('');
    setLoading(true);

    const form = new FormData();
    form.append('file', file);

    const res = await fetch('/api/applications/parse-pdf', { method: 'POST', body: form });
    if (!res.ok) {
      setError('Не удалось прочитать PDF');
      setLoading(false);
      return;
    }

    const { fields, filename } = await res.json();
    onParsed(fields, filename);
    setLoading(false);
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition
        ${dragging ? 'border-blue-400 bg-blue-50' : 'border-blue-300 bg-blue-50 hover:bg-blue-100'}`}
    >
      <input ref={inputRef} type="file" accept=".pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <div className="text-4xl mb-3">📄</div>
      {loading ? (
        <p className="text-blue-600 font-medium">Читаю PDF...</p>
      ) : (
        <>
          <p className="text-blue-700 font-semibold">Перетащите PDF сюда</p>
          <p className="text-gray-500 text-sm mt-1">или нажмите чтобы выбрать файл</p>
        </>
      )}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add components/
git commit -m "feat: add UI components (StatusBadge, ApplicationCard, StatusHistory, PdfUpload)"
```

---

## Task 9: Dashboard Page

**Files:**
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Create dashboard page**

```tsx
// app/dashboard/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Application } from '@/types';
import { getStatusType } from '@/types';
import { ApplicationCard } from '@/components/ApplicationCard';

type Filter = 'all' | 'action_required' | 'in_progress' | 'completed';

export default function DashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [updatingAll, setUpdatingAll] = useState(false);

  useEffect(() => {
    fetch('/api/applications')
      .then(r => r.json())
      .then(setApplications);
  }, []);

  function handleStatusUpdated(updated: Application) {
    setApplications(prev => prev.map(a => a.id === updated.id ? updated : a));
  }

  async function handleUpdateAll() {
    setUpdatingAll(true);
    const active = applications.filter(a => getStatusType(a.acting_party, a.status) !== 'completed');
    for (const app of active) {
      const res = await fetch(`/api/applications/${app.id}/check`, { method: 'POST' });
      if (res.ok) {
        const { application: updated } = await res.json();
        setApplications(prev => prev.map(a => a.id === updated.id ? updated : a));
      }
      await new Promise(r => setTimeout(r, 1000)); // 1s delay between requests
    }
    setUpdatingAll(false);
  }

  const filtered = applications
    .filter(a => filter === 'all' || getStatusType(a.acting_party, a.status) === filter)
    .filter(a =>
      !search ||
      a.application_number.includes(search) ||
      a.service_name.toLowerCase().includes(search.toLowerCase())
    );

  // Action required first
  const sorted = [...filtered].sort((a, b) => {
    const order = { action_required: 0, in_progress: 1, completed: 2 };
    return order[getStatusType(a.acting_party, a.status)] - order[getStatusType(b.acting_party, b.status)];
  });

  const counts = {
    all: applications.length,
    action_required: applications.filter(a => getStatusType(a.acting_party, a.status) === 'action_required').length,
    in_progress: applications.filter(a => getStatusType(a.acting_party, a.status) === 'in_progress').length,
    completed: applications.filter(a => getStatusType(a.acting_party, a.status) === 'completed').length,
  };

  const filterLabels: { key: Filter; label: string; style: string }[] = [
    { key: 'all', label: `Все (${counts.all})`, style: 'bg-blue-600 text-white' },
    { key: 'action_required', label: `Требуют действия (${counts.action_required})`, style: 'bg-red-100 text-red-700' },
    { key: 'in_progress', label: `В ожидании (${counts.in_progress})`, style: 'bg-yellow-100 text-yellow-800' },
    { key: 'completed', label: `Завершены (${counts.completed})`, style: 'bg-green-100 text-green-700' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg">my.gov tracker</h1>
        <div className="flex gap-2">
          <button
            onClick={handleUpdateAll}
            disabled={updatingAll}
            className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            {updatingAll ? 'Обновляю...' : '↻ Обновить все'}
          </button>
          <Link href="/add">
            <button className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
              + Новая
            </button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 bg-white border-b">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Поиск по номеру или услуге..."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Filters */}
      <div className="px-4 py-2 bg-gray-50 border-b flex gap-2 overflow-x-auto">
        {filterLabels.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition
              ${filter === f.key ? f.style : 'bg-gray-200 text-gray-600'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="px-4 py-4 flex flex-col gap-3 max-w-2xl mx-auto">
        {sorted.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">
            {applications.length === 0 ? 'Нет заявок. Добавьте первую!' : 'Ничего не найдено'}
          </p>
        )}
        {sorted.map(app => (
          <ApplicationCard key={app.id} application={app} onStatusUpdated={handleStatusUpdated} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test dashboard manually**

```bash
npm run dev
```

1. Open http://localhost:3000 → login → should see empty dashboard
2. Filter buttons visible, search works (empty state)

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/
git commit -m "feat: add dashboard page with filtering and bulk status update"
```

---

## Task 10: Add Application Page (PDF Upload)

**Files:**
- Create: `app/add/page.tsx`

- [ ] **Step 1: Create add page**

```tsx
// app/add/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ParsedPdf } from '@/types';
import { PdfUpload } from '@/components/PdfUpload';

export default function AddPage() {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedPdf | null>(null);
  const [filename, setFilename] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleParsed(fields: ParsedPdf, name: string) {
    setParsed(fields);
    setFilename(name);
  }

  async function handleSave() {
    if (!parsed) return;
    setSaving(true);
    setError('');

    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed, notes, pdf_filename: filename }),
    });

    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg ?? 'Ошибка сохранения');
      setSaving(false);
      return;
    }

    router.push('/dashboard');
  }

  const fields = [
    { label: 'Номер заявки', key: 'application_number' },
    { label: 'Наименование услуги', key: 'service_name' },
    { label: 'Организация', key: 'organization' },
    { label: 'Состояние', key: 'status' },
    { label: 'Дата подачи', key: 'submission_date' },
    { label: 'Текущее действие', key: 'current_action' },
    { label: 'Пароль для проверки', key: 'verification_password' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 text-lg">←</button>
        <h1 className="font-bold text-lg">Новая заявка</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
        {!parsed ? (
          <PdfUpload onParsed={handleParsed} />
        ) : (
          <>
            {/* Parsed fields preview */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-green-700 font-semibold text-sm mb-3">✓ Данные извлечены из PDF</p>
              <div className="flex flex-col gap-2">
                {fields.map(f => (
                  <div key={f.key} className="flex justify-between text-sm gap-2">
                    <span className="text-gray-500 shrink-0">{f.label}</span>
                    <span className="font-medium text-right">{parsed[f.key] || '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Заметка (необязательно)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Проект, объект, контекст..."
                className="w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setParsed(null); setFilename(''); }}
                className="flex-1 border border-gray-300 rounded-lg py-3 text-sm font-medium hover:bg-gray-50"
              >
                Загрузить другой PDF
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Сохраняю...' : 'Сохранить заявку'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test with a real my.gov.uz PDF**

```bash
npm run dev
```

1. Click "+ Новая" on dashboard → opens add page
2. Upload a real PDF from my.gov.uz
3. Verify all fields parsed correctly
4. Add a note, click "Сохранить заявку"
5. Should redirect to dashboard and show the new card

> If fields are empty/wrong after upload: open the PDF as text and check the exact label wording. Update the `extractLine` calls in `lib/pdf-parser.ts` to match the real labels.

- [ ] **Step 3: Commit**

```bash
git add app/add/
git commit -m "feat: add PDF upload page for new applications"
```

---

## Task 11: Application Detail Page

**Files:**
- Create: `app/applications/[id]/page.tsx`

- [ ] **Step 1: Create detail page**

```tsx
// app/applications/[id]/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Application, StatusHistory as TStatusHistory } from '@/types';
import { getStatusType } from '@/types';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusHistory } from '@/components/StatusHistory';

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [app, setApp] = useState<Application | null>(null);
  const [history, setHistory] = useState<TStatusHistory[]>([]);
  const [notes, setNotes] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then(r => r.json())
      .then(({ application, history }) => {
        setApp(application);
        setHistory(history);
        setNotes(application.notes);
      });
  }, [id]);

  async function handleCheck() {
    setChecking(true);
    const res = await fetch(`/api/applications/${id}/check`, { method: 'POST' });
    if (res.ok) {
      const { application: updated, statusChanged } = await res.json();
      setApp(updated);
      if (statusChanged) {
        // Reload history
        fetch(`/api/applications/${id}`)
          .then(r => r.json())
          .then(({ history }) => setHistory(history));
      }
    }
    setChecking(false);
  }

  async function handleSaveNotes() {
    setSaving(true);
    await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    setSaving(false);
  }

  if (!app) return <div className="p-8 text-center text-gray-400">Загрузка...</div>;

  const type = getStatusType(app.acting_party, app.status);
  const bannerStyle = {
    action_required: 'bg-red-50 border-red-200 text-red-700',
    in_progress: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    completed: 'bg-green-50 border-green-200 text-green-700',
  }[type];

  const fields = [
    { label: 'Наименование услуги', value: app.service_name },
    { label: 'Организация', value: app.organization },
    { label: 'Дата подачи', value: app.submission_date ? new Date(app.submission_date).toLocaleString('ru-RU') : '—' },
    { label: 'Последнее изменение', value: app.last_changed_date ? new Date(app.last_changed_date).toLocaleString('ru-RU') : '—' },
    { label: 'Пароль для проверки', value: app.verification_password },
    { label: 'SMS-телефон', value: app.sms_phone },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 text-lg">←</button>
        <h1 className="font-bold text-base font-mono">№ {app.application_number}</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-5">

        {/* Status banner */}
        <div className={`border rounded-xl p-4 flex justify-between items-center gap-3 ${bannerStyle}`}>
          <div>
            <StatusBadge status={app.status} acting_party={app.acting_party} />
            {app.current_action && (
              <div className="text-sm mt-1">{app.current_action}</div>
            )}
          </div>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="shrink-0 bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {checking ? '...' : '↻ Проверить статус'}
          </button>
        </div>

        {/* Fields */}
        <div className="bg-white rounded-xl border p-4 flex flex-col gap-3">
          {fields.map(f => (
            <div key={f.label}>
              <div className="text-xs text-gray-400 uppercase tracking-wide">{f.label}</div>
              <div className="text-sm text-gray-900 mt-0.5">{f.value || '—'}</div>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border p-4">
          <label className="text-xs text-gray-400 uppercase tracking-wide block mb-2">Заметки</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            className="w-full text-sm text-gray-900 resize-none focus:outline-none min-h-[60px]"
            placeholder="Добавьте заметку..."
          />
          {saving && <p className="text-xs text-gray-400 mt-1">Сохраняю...</p>}
        </div>

        {/* Status history */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-xs text-gray-400 uppercase tracking-wide mb-3">История статусов</h2>
          <StatusHistory history={history} />
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test detail page**

```bash
npm run dev
```

1. Add an application via PDF upload (Task 10)
2. Click on the card → opens detail page
3. Verify all fields shown
4. Add a note, click elsewhere → note saves automatically (onBlur)
5. Click "↻ Проверить статус" → button shows "..." while loading

- [ ] **Step 3: Commit**

```bash
git add app/applications/
git commit -m "feat: add application detail page with status history"
```

---

## Task 12: Root Layout + Final Polish

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update root layout**

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'my.gov tracker',
  description: 'Трекер заявок my.gov.uz',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run full manual smoke test**

```bash
npm run dev
```

Checklist:
- [ ] Open app → redirected to /login
- [ ] Wrong PIN → error shown
- [ ] Correct PIN → dashboard
- [ ] "+ Новая" → upload PDF → fields parsed → save → appears on dashboard
- [ ] Red card for "Заявитель" applications
- [ ] Click card → detail page
- [ ] "↻ Проверить статус" → updates (or returns error if my.gov.uz URL needs adjustment)
- [ ] "↻ Обновить все" on dashboard → updates all active applications
- [ ] Works on mobile (open http://your-local-ip:3000 on phone)

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: finalize layout and complete application tracker"
```

---

## Task 13: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/YOUR_USERNAME/mygov-tracker.git
git push -u origin main
```

- [ ] **Step 2: Deploy on Vercel**

1. Go to vercel.com → "Add New Project" → Import from GitHub
2. Select the `mygov-tracker` repository
3. Framework Preset: Next.js (auto-detected)
4. Add environment variables:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your service role key
   - `APP_PIN` = your PIN (e.g. 1234)
5. Click "Deploy"

- [ ] **Step 3: Test production**

1. Open the Vercel URL on phone and computer
2. Repeat the smoke test checklist from Task 12, Step 3
3. If "↻ Проверить статус" returns errors: check Vercel function logs → Functions tab in Vercel dashboard

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: production deployment ready"
git push
```

---

## Notes for the Developer

**PDF label matching:** The PDF parser uses label text to find values. If any field comes back empty after upload, open the PDF as plain text (`pdftotext application.pdf -` on Mac/Linux) and verify the exact label wording. Update the `extractLine` calls in `lib/pdf-parser.ts` accordingly.

**my.gov.uz status page URL:** The `buildStatusCheckUrl` function in `lib/status-checker.ts` uses a guessed URL pattern. Before Task 8 testing: open my.gov.uz, find the public status check page (no login required), inspect the URL and form structure, and update `STATUS_CHECK_BASE` and `parseStatusPage` to match the actual HTML.

**Vercel function timeout:** Status checks make HTTP requests to my.gov.uz. Vercel free tier has a 10s function timeout. If my.gov.uz is slow, the "Update all" sequential loop may timeout. If this happens, consider reducing the delay between requests and checking only 5 applications at a time.
