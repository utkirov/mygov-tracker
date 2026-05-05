# Operational UI And Background Sync - Design Spec

**Date:** 2026-05-05
**Author:** Codex
**Status:** Draft

---

## Problem

The current local-only app is functional but not operationally usable.

Main issues:
- auto-refresh behavior is page-bound instead of application-bound
- there is no explicit scheduler or queue model
- the UI shows current status but does not clearly show what changed
- `Последнее изменение` is not treated as the primary monitoring signal
- dashboard, detail, and settings do not form a coherent workflow
- `archive` and `settings` are missing as real pages in the current worktree
- preview/original concepts are not clearly separated in the UX

The result is that users cannot reliably monitor many applications in one place while the app is running.

---

## Goal

Build a local operational monitoring experience where:
- background syncing works while the application is running, regardless of the current page
- applications are checked through a constrained queue
- changed applications are clearly surfaced
- `Последнее изменение` is visually emphasized across the product
- the core screens are rebuilt around monitoring work rather than static CRUD

---

## Scope

### In Scope

- application-level background scheduler while the app is open
- queue-based update model with pacing and limited concurrency
- persisted sync metadata per application
- change detection for:
  - `status`
  - `current_action`
  - `acting_party`
  - `last_changed_date`
- full UX rebuild of:
  - app shell
  - dashboard
  - application card
  - application detail
  - settings page
  - archive page
- fixing critical UX and behavior issues in the current local branch

### Out of Scope

- tests in this pass
- standalone OS-level background daemon
- notifications redesign beyond current behavior
- broad billing/product expansion work

---

## Users

Usage is split roughly 50/50 between desktop and mobile.

The primary user need is ongoing monitoring of many applications, not one-time record storage. The interface must optimize for:
- rapid recognition of changes
- fast triage of attention-needed items
- trust in background sync state

---

## Recommended Approach

Use a two-layer rebuild:

1. Build the operational layer first
- global scheduler
- queue state
- change detection
- persisted sync metadata

2. Build the UI around that real state
- summary blocks
- change feed
- attention queue
- active list
- detail-level diff presentation

This avoids a dishonest UI that claims more than the runtime actually knows.

---

## Background Sync Design

### Runtime model

Background sync runs while the application process is alive, regardless of which page is currently open.

The scheduler must not live inside the dashboard page. It should live in a shared application layer that remains active while the app is running.

### Queue model

Use a constrained queue:
- active applications only
- archived applications excluded
- completed applications excluded
- one or a few checks at a time
- pause between checks
- repeated cycles on configured interval

Recommended first implementation:
- one scheduler
- one active cycle at a time
- sequential processing by default
- configurable cycle interval
- configurable delay between items
- configurable concurrency limit, even if initial effective behavior is `1`

### Required scheduler state

Global state:
- `enabled`
- `intervalMinutes`
- `delayBetweenChecksMs`
- `concurrencyLimit`
- `isRunning`
- `queueLength`
- `currentApplicationId`
- `lastRunAt`
- `nextRunAt`
- `lastRunError`

Per application:
- `last_checked_at`
- `next_check_at`
- `sync_state`
  - `idle`
  - `queued`
  - `checking`
  - `success`
  - `error`
- `last_error`
- `last_detected_change_at`
- `last_change_summary`

### Guardrails

- prevent overlapping global cycles
- prevent duplicate enqueue of the same application
- stop checking completed and archived applications automatically
- degrade gracefully on per-application errors without killing the whole cycle

---

## Change Detection Design

An application is considered changed when any of these fields differ from the previous stored state:
- `status`
- `current_action`
- `acting_party`
- `last_changed_date`

### Change summary

The system must create a human-readable summary of the latest detected change.

Example shape:
- `changedFields`
- `summaryLines`
- `detectedAt`
- `sourceLastChangedDate`

Examples:
- `Статус: В обработке -> Завершено`
- `Действует: Ведомство -> Заявитель`
- `Последнее изменение: 02.05.2026 14:10 -> 05.05.2026 09:35`

### Visual priority

The most important monitoring signal is:
1. object or service name
2. `Последнее изменение`
3. what changed
4. whether the applicant must act

Current status remains visible, but is not the dominant signal anymore.

---

## UX Architecture

### App shell

Rebuild the shell so the app feels like an operational workspace, not a set of disconnected pages.

Requirements:
- clear persistent navigation
- obvious route states
- no dead links
- room for a sync indicator or operational status

### Dashboard

The dashboard becomes the monitoring hub.

Sections:

#### 1. Sync status

Show:
- auto-update enabled or disabled
- interval
- queue size
- currently checking application
- last successful sync
- next scheduled run
- cycle errors if any

#### 2. What changed

Dedicated feed of recently changed applications.

Each item shows:
- object or service
- `Последнее изменение`
- which fields changed
- when the app detected the change

#### 3. Requires attention

Applications where the applicant must act.

These should rank above ordinary in-progress items.

#### 4. All active applications

Search, filters, and the main list remain, but below the operational sections.

### Application cards

Cards should be redesigned around monitoring clarity.

Each card should show:
- object or service as primary label
- application number as secondary metadata
- `Последнее изменение` prominently
- concise change summary
- operational badge set:
  - `checking`
  - `queued`
  - `changed`
  - `error`
- current status and current action as supporting data

### Application detail

The detail page should lead with operational summary.

Top summary block:
- object
- number
- status
- `Последнее изменение`
- `Последняя проверка`
- `Следующая проверка`
- sync state

Primary detail sections:
- latest detected change
- key fields
- original/preview actions
- notes
- status history timeline

History should visually emphasize records with meaningful change, especially `last_changed_date`.

### Settings

Settings becomes the scheduler control panel.

Sections:
- `Автообновление`
  - enable/disable
  - interval
  - delay between checks
  - concurrency limit
- `Очередь`
  - retry behavior
  - error handling rules
- `Уведомления`
- explanatory notes
  - archived and completed applications are excluded
  - syncing only runs while the application is open

### Archive

Archive should exist as a real screen and be separated from active operational work.

Archive focus:
- search
- filters
- final status
- last changed date

Archive should not show queue noise or active sync controls.

---

## Visual Hierarchy

### Desktop

Use a two-level monitoring layout:
- top: sync summary and monitoring panels
- below: changed feed, attention list, active list

### Mobile

Prioritize stacked summary cards first, then:
- what changed
- requires attention
- active list

### Style direction

The rebuild should not look like a generic CRUD dashboard.

Visual goals:
- stronger information hierarchy
- clearer spacing
- clearer panel separation
- more confident typography
- more noticeable monitoring states
- cleaner action grouping

The UI must remain practical first, but it should feel intentional rather than provisional.

---

## Data Model Changes

The local application model needs additional sync metadata fields:
- `last_checked_at`
- `next_check_at`
- `sync_state`
- `last_error`
- `last_detected_change_at`
- `last_change_summary`
- optionally `last_change_fields`

The local settings model needs scheduler controls:
- `auto_check.enabled`
- `auto_check.interval_minutes`
- `auto_check.delay_between_checks_ms`
- `auto_check.concurrency_limit`

If the current shape needs extension, preserve backward compatibility where reasonable.

---

## Key Fixes To Include

- remove page-scoped auto-refresh logic and replace it with global scheduler behavior
- restore missing real `archive` and `settings` pages
- surface change explanations instead of only current values
- separate clearly:
  - live preview
  - original local PDF
- align shell navigation with real route availability

---

## Risks

1. Moving sync from page scope to app scope introduces shared-state complexity and requires careful lifecycle handling.
2. A queue model without clear persistence rules can drift if sync state is updated inconsistently.
3. Overemphasizing operational state can clutter mobile if summary sections are not tightly designed.
4. UI rebuild without tests increases regression risk, especially around state synchronization.

---

## Implementation Order

1. Add shared scheduler/service layer
2. Persist sync metadata in local DB
3. Replace page-bound auto-update logic
4. Rebuild dashboard around operational state
5. Rebuild cards and detail page
6. Add full settings and archive pages
7. Polish shell and visual hierarchy

---

## Verification Expectations For Implementation

Even though automated tests are deferred, implementation should still be manually verified for:
- scheduler runs while app is on different pages
- archived and completed applications do not re-enter the queue
- changed fields are correctly summarized
- dashboard reflects live queue state
- detail page shows last change and sync metadata
- settings affect runtime scheduler behavior
- archive route exists and behaves correctly

---

## Design Decision Summary

- Background sync runs at the application level while the app is open
- Queue-based checking with pacing and concurrency controls
- `Последнее изменение` is the primary monitoring signal
- Dashboard becomes an operational monitoring center
- Detail page emphasizes latest change and sync state
- Settings and archive become real, rebuilt product surfaces
