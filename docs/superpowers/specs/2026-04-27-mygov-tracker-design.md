# my.gov.uz Application Tracker — Design Spec

**Date:** 2026-04-27
**Author:** Sharipov Ilxom Utkirovich
**Status:** Approved

---

## Problem

A top manager at a project organization submits many government service applications through my.gov.uz. Status updates arrive only via SMS with an application number, making it hard to remember which number corresponds to which service or ministry. There is no easy way to track the state of all applications in one place.

---

## Solution

A personal responsive web application that:
1. Accepts a PDF export from my.gov.uz and automatically extracts all application fields
2. Stores all applications in a database with full status history
3. Provides a "Check status" button that automatically fetches the latest status from the my.gov.uz public status-check page (no ЭЦП required — uses application number + verification password)

---

## Users

Single user only (personal tool). Access protected by a PIN code shown on first open.

---

## Architecture

```
Browser (phone / PC)
       ↓
  Next.js App Router — Vercel (free tier)
  ├── UI pages (responsive, Tailwind CSS)
  └── API routes (serverless functions)
       ├── POST /api/applications/parse-pdf   → parse PDF, return extracted fields
       ├── POST /api/applications              → save application to DB
       ├── GET  /api/applications              → list all applications
       ├── GET  /api/applications/[id]         → single application detail
       ├── PATCH /api/applications/[id]        → update notes / manual fields
       └── POST /api/applications/[id]/check   → scrape my.gov.uz, update status
              ↓
         Supabase (PostgreSQL, free tier)
```

**PDF parsing:** `pdf-parse` library on the server — extracts text, then regex/heuristics to find fields by label names matching the my.gov.uz PDF format.

**Status scraping:** `playwright` (or `cheerio` + `node-fetch` if the page is server-rendered) hits the my.gov.uz public application status page using the application number and verification password — no login or ЭЦП required.

**Auth:** Simple PIN code (4–6 digits) stored as an environment variable. Checked on the server via a session cookie. No user accounts.

---

## Data Model

### Table: `applications`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | auto-generated |
| `application_number` | text (unique) | e.g. 285680359 |
| `service_name` | text | extracted from PDF |
| `organization` | text | ministry / agency |
| `status` | text | current status label |
| `submission_date` | timestamptz | date of original submission |
| `last_changed_date` | timestamptz | date of last status change on my.gov.uz |
| `current_action` | text | e.g. "Оплата" |
| `acting_party` | text | "Заявитель" or "Ведомство" |
| `verification_password` | text | пароль для проверки (from PDF) |
| `sms_phone` | text | phone registered for SMS |
| `notes` | text | user's personal notes |
| `pdf_filename` | text | original PDF filename for reference |
| `created_at` | timestamptz | when added to tracker |
| `updated_at` | timestamptz | when last updated in tracker |

### Table: `status_history`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `application_id` | uuid (FK → applications.id) | |
| `status` | text | status label at this point |
| `current_action` | text | action label at this point |
| `acting_party` | text | who must act |
| `recorded_at` | timestamptz | when this status was recorded |

---

## Screens

### 1. Dashboard (main screen)

- List of all applications as cards, sorted by `updated_at` desc
- Cards color-coded by state:
  - **Red** — `acting_party = 'Заявитель'` (requires user action)
  - **Yellow** — `acting_party = 'Ведомство'` (waiting on ministry)
  - **Green** — terminal status: status contains "Одобрено", "Завершено", "Выдано", or "Отказано"
- Filter tabs: All / Requires action / In progress (yellow) / Completed (green)
- Search bar: filter by application number or service name
- "Update all" button: runs status check on all non-completed applications sequentially
- "+ New application" button: opens PDF upload flow

### 2. Application card (dashboard item)

Displays: application number, service name (truncated), organization, status badge, last changed date, "Check status" button.

Red border + red background when action required by applicant.

### 3. Application detail page

Full details: all fields from the data model, editable notes field, status history timeline, "Check status" button at top.

### 4. Add application (PDF upload)

- Drag-and-drop or click-to-select PDF upload
- On upload: server parses PDF → returns extracted fields preview
- User sees auto-filled fields (read-only), can add optional notes
- "Save application" button → saves to DB, redirects to dashboard

### 5. Status check flow

On clicking "Check status" (single) or "Update all":
- Button shows loading spinner
- Server fetches my.gov.uz public status page using `application_number` + `verification_password`
- Extracted: status, current_action, acting_party, last_changed_date
- If status changed: new row inserted in `status_history`, `applications` row updated
- Card/page refreshes with new data

---

## Key UX Rules

- Applications requiring user action (acting_party = 'Заявитель') must be visually dominant — shown first, red highlight
- "Update all" checks sequentially with a small delay to avoid being blocked by my.gov.uz
- Completed applications (status = "Одобрено" / "Завершено" / "Выдано" / "Отказано") are excluded from "Update all" to avoid unnecessary requests
- Mobile-first layout: cards stack vertically on small screens, split-view detail on desktop

---

## Environment Variables

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_PIN=
```

---

## Out of Scope

- Multi-user / team access
- Push notifications / automated background polling
- Direct my.gov.uz login via ЭЦП
- File storage of the original PDFs (only metadata is stored)
