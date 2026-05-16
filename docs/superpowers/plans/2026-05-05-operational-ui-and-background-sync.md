# Operational UI And Background Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the local application into an operational monitoring tool with app-level background syncing, queue state, change summaries, and a new UX centered on `Последнее изменение`.

**Architecture:** Add a shared client-side scheduler/service that runs while the app is open, persist sync metadata in the local DB, then rebuild the shell and core screens around that real operational state. Keep the backend local-only and reuse existing route handlers while extending the local data model and API payloads to expose sync state and change summaries.

**Tech Stack:** Next.js App Router, React 19, TypeScript, local JSON storage, local PDF storage, existing status checker

---

## File Structure Map

### Create

- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\lib\sync-engine.ts`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\SyncStatusPanel.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\ChangesFeed.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\AttentionQueue.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\EmptyState.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\LastChangeSummary.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\settings\page.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\archive\page.tsx`

### Modify

- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\lib\local-db.ts`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\types\index.ts`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\api\applications\route.ts`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\api\applications\[id]\check\route.ts`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\api\settings\route.ts`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\AppShell.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\ApplicationCard.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\StatusHistory.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\dashboard\page.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\applications\[id]\page.tsx`
- `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\globals.css`

---

### Task 1: Extend Local Data And API Shapes For Operational State

**Files:**
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\lib\local-db.ts`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\types\index.ts`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\api\applications\route.ts`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\api\applications\[id]\check\route.ts`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\api\settings\route.ts`

- [ ] **Step 1: Add sync metadata to the local DB types**

Update `LocalDbApplication` in `lib/local-db.ts` to include:

```ts
sync_state: 'idle' | 'queued' | 'checking' | 'success' | 'error'
last_checked_at: string | null
next_check_at: string | null
last_error: string
last_detected_change_at: string | null
last_change_summary: string[]
last_change_fields: Array<'status' | 'current_action' | 'acting_party' | 'last_changed_date'>
```

Update `LocalDbSettings['auto_check']` to include:

```ts
enabled: boolean
interval_minutes: number | null
delay_between_checks_ms: number | null
concurrency_limit: number | null
```

- [ ] **Step 2: Normalize old records safely**

In `normalizeApplications()` and `normalizeSettings()` in `lib/local-db.ts`, add defaults so old JSON records hydrate without crashes:

```ts
sync_state: raw.sync_state ?? 'idle',
last_checked_at: raw.last_checked_at ?? null,
next_check_at: raw.next_check_at ?? null,
last_error: raw.last_error ?? '',
last_detected_change_at: raw.last_detected_change_at ?? null,
last_change_summary: Array.isArray(raw.last_change_summary) ? raw.last_change_summary : [],
last_change_fields: Array.isArray(raw.last_change_fields) ? raw.last_change_fields : [],
```

- [ ] **Step 3: Expose the new fields to the app types**

In `types/index.ts`, extend `Application` with the same sync metadata and add:

```ts
export type SyncState = 'idle' | 'queued' | 'checking' | 'success' | 'error';
```

- [ ] **Step 4: Create change-summary logic in the check route**

In `app/api/applications/[id]/check/route.ts`, compare previous and new values of:
- `status`
- `current_action`
- `acting_party`
- `last_changed_date`

Populate:

```ts
const changedFields: Application['last_change_fields'] = []
const summary: string[] = []
```

Then write:

```ts
application.last_detected_change_at = statusChanged ? nowIso : application.last_detected_change_at
application.last_change_summary = summary
application.last_change_fields = changedFields
application.last_checked_at = nowIso
application.last_error = ''
application.sync_state = 'success'
```

- [ ] **Step 5: Keep list/settings payloads compatible**

In `app/api/applications/route.ts`, keep returning an array the dashboard can consume directly.

In `app/api/settings/route.ts`, keep GET compatible with the existing UI by returning a flat map like:

```ts
{
  telegram_token: db.settings.telegram.bot_token,
  telegram_chat_id: db.settings.telegram.chat_id,
  auto_check_enabled: db.settings.auto_check.enabled,
  auto_check_interval: db.settings.auto_check.interval_minutes,
  auto_check_delay_ms: db.settings.auto_check.delay_between_checks_ms,
  auto_check_concurrency: db.settings.auto_check.concurrency_limit,
}
```

- [ ] **Step 6: Run the app typecheck**

Run: `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/local-db.ts types/index.ts app/api/applications/route.ts app/api/applications/[id]/check/route.ts app/api/settings/route.ts
git commit -m "feat: add operational sync metadata"
```

### Task 2: Add A Shared Background Sync Engine

**Files:**
- Create: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\lib\sync-engine.ts`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\AppShell.tsx`

- [ ] **Step 1: Create the shared scheduler/service**

In `lib/sync-engine.ts`, define:

```ts
export interface SyncEngineSnapshot {
  enabled: boolean
  intervalMinutes: number
  delayBetweenChecksMs: number
  concurrencyLimit: number
  isRunning: boolean
  queueLength: number
  currentApplicationId: string | null
  lastRunAt: string | null
  nextRunAt: string | null
  lastRunError: string
}
```

Add a singleton-like module with:

```ts
start()
stop()
subscribe(listener)
getSnapshot()
requestImmediateRun()
```

- [ ] **Step 2: Implement guarded queue execution**

Inside `start()`, load settings + applications via fetch and:
- exclude `archived`
- exclude completed statuses using existing `getStatusType(...) === 'completed'`
- mark selected items as `queued`
- process sequentially with delay
- prevent overlapping cycles with an `isRunning` guard

- [ ] **Step 3: Update application sync state during processing**

For each item:

```ts
PATCH /api/applications/[id] { sync_state: 'queued', next_check_at }
POST /api/applications/[id]/check
PATCH /api/applications/[id] { sync_state: 'checking' }
```

After completion:
- on success: `success`
- on failure: `error` + `last_error`

- [ ] **Step 4: Mount the engine at app level**

In `components/AppShell.tsx`, initialize the sync engine once with `useEffect` so it runs while the app is open, regardless of the current page.

Add cleanup:

```ts
useEffect(() => {
  syncEngine.start()
  return () => syncEngine.stop()
}, [])
```

- [ ] **Step 5: Run a production build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/sync-engine.ts components/AppShell.tsx
git commit -m "feat: add app-level background sync engine"
```

### Task 3: Rebuild The Dashboard Around Monitoring State

**Files:**
- Create: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\SyncStatusPanel.tsx`
- Create: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\ChangesFeed.tsx`
- Create: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\AttentionQueue.tsx`
- Create: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\EmptyState.tsx`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\dashboard\page.tsx`

- [ ] **Step 1: Add monitoring components**

Create `SyncStatusPanel.tsx` to display:
- enabled state
- interval
- queue length
- current application
- last run
- next run
- last error

Create `ChangesFeed.tsx` to render applications where:

```ts
application.last_detected_change_at
```

sorted descending by detected change time.

Create `AttentionQueue.tsx` for items where:

```ts
getStatusType(application.acting_party, application.status) === 'action_required'
```

- [ ] **Step 2: Replace the current flat dashboard layout**

In `app/dashboard/page.tsx`, rebuild the screen into:
- sync summary section
- changed applications section
- requires attention section
- active applications section

Keep existing search and filters, but move them into the “All active applications” block.

- [ ] **Step 3: Add live refresh subscription**

Subscribe the dashboard to the sync engine snapshot and periodically reload applications/projects from API so it reflects background activity even when sync runs outside the page itself.

- [ ] **Step 4: Prioritize `Последнее изменение`**

For changed items and active items, sort/display by:
1. action required
2. latest `last_changed_date`
3. latest `last_detected_change_at`

- [ ] **Step 5: Run the build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/SyncStatusPanel.tsx components/ChangesFeed.tsx components/AttentionQueue.tsx components/EmptyState.tsx app/dashboard/page.tsx
git commit -m "feat: rebuild dashboard as monitoring hub"
```

### Task 4: Redesign Cards And Detail For Last-Change Visibility

**Files:**
- Create: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\LastChangeSummary.tsx`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\ApplicationCard.tsx`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\StatusHistory.tsx`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\applications\[id]\page.tsx`

- [ ] **Step 1: Add a reusable change-summary component**

`LastChangeSummary.tsx` should render:
- label `Последнее изменение`
- detected time
- summary lines
- changed-field badges

- [ ] **Step 2: Rebuild the application card hierarchy**

In `components/ApplicationCard.tsx`, make the primary sequence:
- object/service
- `Последнее изменение`
- change summary
- operational sync badge
- status/current action as supporting info

Add operational badges from `sync_state`:
- `checking`
- `queued`
- `error`
- `changed`

- [ ] **Step 3: Rebuild the detail header**

In `app/applications/[id]/page.tsx`, replace the current top section with a sticky summary block containing:
- object
- number
- status
- `Последнее изменение`
- `Последняя проверка`
- `Следующая проверка`
- `Состояние синка`

Below it, add a dedicated “Последнее найденное изменение” section using `LastChangeSummary`.

- [ ] **Step 4: Make history clearer**

In `components/StatusHistory.tsx`, visually emphasize entries where:
- `recorded_at` equals or is close to `last_detected_change_at`
- there was a `last_changed_date` change

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/LastChangeSummary.tsx components/ApplicationCard.tsx components/StatusHistory.tsx app/applications/[id]/page.tsx
git commit -m "feat: emphasize last-change state across cards and detail"
```

### Task 5: Build Real Settings And Archive Pages

**Files:**
- Create: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\settings\page.tsx`
- Create: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\archive\page.tsx`

- [ ] **Step 1: Add a real settings control panel**

`app/settings/page.tsx` should:
- load `/api/settings`
- render controls for:
  - auto-update enabled
  - interval
  - delay between checks
  - concurrency limit
- save back to `/api/settings`
- explain:
  - archived and completed applications are excluded
  - syncing works only while app is open

- [ ] **Step 2: Add a real archive page**

`app/archive/page.tsx` should:
- load `/api/applications?archived=true`
- support search
- show final status and `Последнее изменение`
- omit active sync controls

- [ ] **Step 3: Verify route availability**

Run: `npm run build`

Expected: PASS and `/settings` plus `/archive` appear in the route list

- [ ] **Step 4: Commit**

```bash
git add app/settings/page.tsx app/archive/page.tsx
git commit -m "feat: add operational settings and archive pages"
```

### Task 6: Polish Shell And Global Visual Language

**Files:**
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\components\AppShell.tsx`
- Modify: `D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\app\globals.css`

- [ ] **Step 1: Make shell reflect the operational product**

Update `AppShell.tsx` so navigation feels like an operational workspace:
- stable nav
- clear active state
- room for a compact sync indicator
- no dead-link assumptions

- [ ] **Step 2: Rework global visual tokens**

In `app/globals.css`:
- strengthen hierarchy variables
- improve surface contrast
- define panel, badge, and emphasis styles
- improve desktop/mobile spacing scale

- [ ] **Step 3: Build and inspect**

Run: `npm run build`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/AppShell.tsx app/globals.css
git commit -m "style: polish operational shell and visual system"
```

---

## Self-Review

### Spec coverage

- app-level scheduler: Task 2
- constrained queue: Task 2
- persisted sync metadata: Task 1
- changed-field summaries: Task 1 and Task 4
- rebuilt dashboard: Task 3
- rebuilt cards/detail: Task 4
- real settings/archive pages: Task 5
- shell/visual polish: Task 6

### Placeholder scan

- No `TODO` / `TBD`
- All tasks include exact file paths and concrete verification commands

### Type consistency

- `sync_state` values are consistent across tasks
- settings keys align with the proposed `auto_check` extension
- application sync metadata names are consistent between DB, API, and UI
