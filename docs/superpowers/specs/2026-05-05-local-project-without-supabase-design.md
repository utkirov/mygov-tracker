# Local-Only Project Without Supabase - Design Spec

**Date:** 2026-05-05
**Author:** Codex
**Status:** Draft

---

## Problem

The current project depends on Supabase for authentication, database access, and file storage. That creates unnecessary operational complexity for the user's current goal: run the application fully locally as a single shared workspace without login, external services, or hosted infrastructure.

The migration must remove Supabase from runtime behavior while preserving the existing product flow:
- open the app directly
- create projects
- upload and parse PDF applications
- store and reopen original PDFs
- check application status
- archive and browse applications
- edit settings

---

## Solution

Convert the application into a single-tenant local system with:
- no authentication
- a JSON-backed local database file at `data/local-db.json`
- local PDF storage under `data/pdfs/`
- local helpers for persistence and file management
- API routes rewritten to use the local backend instead of Supabase

The UI remains mostly unchanged. The main functional difference is that all data is shared and immediately available without login.

---

## Scope

### In Scope

- Remove Supabase from runtime code paths
- Remove login, registration, logout, and session checks
- Replace database persistence with local JSON storage
- Replace Supabase storage with local filesystem PDF storage
- Preserve application, project, settings, archive, subscription, and status-check features
- Keep plan handling local, defaulting to `pro`

### Out of Scope

- Multi-user support
- Concurrent write guarantees beyond basic local safety
- Encryption for local secrets
- Production-grade hosted deployment
- Automated migration from an existing remote Supabase dataset

---

## Users

Single local workspace only. There is no concept of account, ownership, or per-user access. Anyone opening the local app sees the same data.

---

## Architecture

```text
Browser
  ->
Next.js App Router
  |- UI pages
  |- API routes
      |- local DB helper (`lib/local-db.ts`)
      |- local storage helper (`lib/local-storage.ts`)
      |- subscription helper (`lib/subscription.ts`)
      |- existing PDF parser / status checker
  ->
Local filesystem
  |- data/local-db.json
  |- data/pdfs/*
```

### Runtime model

- Pages open directly without authentication gates.
- API routes read and write a shared JSON database file.
- Original PDF files are stored on disk and served back by route handlers.
- Subscription and settings are global local state, not tied to a user.

---

## Data Model

The local database file stores one JSON object with these top-level keys:

### `meta`

- `version: number`
- `nextIds`
  - `application: number`
  - `project: number`
  - `statusHistoryEntry: number`

### `subscription`

- `planId: 'free' | 'standard' | 'pro'`
- `status: string`
- `expiresAt: string | null`

Default value:
- `planId = 'pro'`
- `status = 'active'`
- `expiresAt = null`

### `settings`

- `telegram_bot_token: string`
- `telegram_chat_id: string`
- `check_interval_minutes: number`
- `notifications_enabled: boolean`

### `projects`

- `id: string`
- `name: string`
- `created_at: string`

### `applications`

Each application keeps the existing UI-facing shape as much as possible, including:
- `id: string`
- `application_number: string`
- `service_name: string`
- `organization: string`
- `status: string`
- `submission_date: string | null`
- `last_changed_date: string | null`
- `current_action: string`
- `acting_party: string`
- `verification_password: string`
- `sms_phone: string`
- `notes: string`
- `pdf_filename: string`
- `pdf_path: string | null`
- `project_id: string | null`
- `is_archived: boolean`
- `created_at: string`
- `updated_at: string`
- `status_history: StatusHistoryEntry[]`

### `status_history` entry shape

- `id: string`
- `status: string`
- `current_action: string`
- `acting_party: string`
- `recorded_at: string`

---

## Local Storage Rules

### JSON database

- If `data/local-db.json` does not exist, it is created automatically with an empty default structure.
- Writes use an atomic pattern:
  1. write `local-db.json.tmp`
  2. replace `local-db.json`
- If the file is unreadable or invalid JSON, API routes return `500` with a clear local-storage error.

### PDF storage

- PDFs are stored in `data/pdfs/`
- Each file uses a generated unique filename to avoid collisions
- Replacing a PDF deletes the previous local file when possible
- Missing PDF files return `404`

---

## API Behavior

### Authentication routes

The following routes are removed or reduced to inert local responses:
- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/logout`
- `/api/auth/me`

Preferred behavior:
- remove login/register/logout behavior entirely
- `/api/auth/me` may either be removed or return a fixed local mode payload if the current UI still expects it during migration

### `proxy.ts`

- Remove session-based redirect logic
- Either delete `proxy.ts` or reduce it to a no-op file if the project structure still expects it

### Application routes

- `GET /api/applications`
  - return all local applications
- `POST /api/applications`
  - create an application in local DB
  - validate required fields
  - preserve existing plan-limit behavior as local policy where still used
- `GET /api/applications/[id]`
  - return one local application
- `PATCH /api/applications/[id]`
  - update editable fields
- `DELETE /api/applications/[id]`
  - remove application and linked PDF file if present
- `POST /api/applications/[id]/pdf`
  - store PDF on disk
  - update `pdf_path` and `pdf_filename`
- `GET /api/applications/[id]/preview`
  - stream inline PDF from local disk
- `POST /api/applications/[id]/check`
  - run the current checker
  - update current fields and append `status_history` on change
  - skip archived and completed applications according to current product rules
- `POST /api/applications/parse-pdf`
  - parse uploaded PDF locally
  - do not require Supabase or auth

### Project routes

- `GET /api/projects`
  - return local projects
- `POST /api/projects`
  - create local project
- `PATCH /api/projects/[id]`
  - update local project
- `DELETE /api/projects/[id]`
  - delete local project, preserving or detaching linked applications according to current route behavior

### Settings routes

- `GET /api/settings`
  - return local settings
- `PUT /api/settings`
  - update local settings

### Subscription routes

- `GET /api/subscription`
  - return local subscription, default `pro`
- `POST /api/admin/subscription`
  - optional dev-only local override route
  - if retained, it updates local `subscription`

---

## UI Impact

### Auth and navigation

- Remove login/register/logout flows from the user journey
- Pages that used to redirect to login should render immediately
- Any top-level shell that expects a current user should switch to local-mode assumptions

### Compatibility target

Keep current screens visually stable:
- dashboard
- add application
- application detail
- archive
- settings

The UI should not require major redesign for this migration. The goal is runtime replacement, not interface redesign.

---

## Error Handling

- Invalid or unreadable local DB file: `500`
- Missing application: `404`
- Missing project: `404`
- Missing PDF file: `404`
- Invalid request body: `400`
- Failed status check or parser failure: preserve the current route error behavior where possible
- PDF write failure during create flow: rollback the created application if the route expects file persistence as part of the same successful action

---

## Migration Steps

1. Add local DB and local storage helpers
2. Replace Supabase-backed auth/session code with local no-auth behavior
3. Rewrite route handlers to use local JSON and local PDF storage
4. Update UI code that expects auth state
5. Remove Supabase packages and config from the project
6. Verify end-to-end local flows

---

## Verification Plan

### Automated

- `npx tsc --noEmit`
- `npx eslint` on changed files or project-wide if the config permits
- `npm test -- --runInBand`

### Manual

- Open app directly without login
- Create a project
- Upload and parse a PDF
- Save a new application
- Open original PDF
- Run single status check
- Confirm auto-refresh logic still excludes archived and completed applications
- Archive an application
- Open archive page
- Update settings

---

## Risks

1. Existing UI code may still assume a user object or auth endpoint response shape.
2. Local JSON persistence is simpler but less resilient than a real database under heavy parallel writes.
3. Removing Supabase may expose hidden coupling in utility code, especially in subscription and storage logic.
4. Local secret storage is acceptable for this scope but not safe for a hosted multi-user deployment.

---

## Design Decision Summary

- Local-only, single shared workspace
- No authentication
- JSON database on disk
- PDF files stored locally
- Default local plan is `pro`
- Supabase removed from runtime and dependencies
