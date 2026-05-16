# my.gov Tracker: Cleanup, Performance & Auto-Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove landing page, refactor codebase for performance, add Windows auto-start functionality with background operation.

**Architecture:** 
1. Remove `/app/page.tsx` and all landing components
2. Redirect root to `/dashboard` 
3. Refactor for performance: code splitting, lazy loading, optimize sync engine, remove dead code
4. Configure Electron to auto-start on Windows and run in background (system tray)
5. Optimize Next.js build (compression, caching headers, image optimization)

**Tech Stack:** Next.js 16.2.4, Electron 41.3.0, TypeScript, Tailwind CSS, local JSON storage

---

## File Structure Map

### Remove (Landing Page)
- Delete: `app/page.tsx`
- Delete: `components/landing/` (all landing components)

### Modify (Routing & Performance)
- Modify: `app/layout.tsx` — remove landing nav, set root redirect
- Modify: `next.config.ts` — add performance optimizations
- Modify: `components/AppShell.tsx` — check if it assumes landing
- Modify: `app/dashboard/page.tsx` — lazy load heavy components
- Modify: `app/applications/[id]/page.tsx` — lazy load sections
- Modify: `lib/sync-engine.ts` — optimize listener cleanup, debounce updates
- Modify: `electron/main.js` — add auto-start, tray icon, background mode
- Modify: `package.json` — update electron build config

### Add (Performance & Auto-Start)
- Create: `lib/performance-utils.ts` — helpers for lazy loading, memoization
- Create: `electron/tray-menu.ts` — system tray menu logic
- Create: `scripts/build-windows-autostart.mjs` — register Windows auto-start

---

## Task 1: Remove Landing Page and Routes

**Files:**
- Delete: `app/page.tsx`
- Delete: `components/landing/Hero.tsx`
- Delete: `components/landing/Features.tsx`
- Delete: `components/landing/HowItWorks.tsx`
- Delete: `components/landing/Pricing.tsx`
- Delete: `components/landing/CTASection.tsx`
- Delete: `components/landing/Footer.tsx`
- Delete: `components/landing/LandingNav.tsx`

**Steps:**

- [ ] **Step 1:** List all landing component files
- [ ] **Step 2:** Delete landing components directory
- [ ] **Step 3:** Delete root landing page `app/page.tsx`
- [ ] **Step 4:** Verify deletions with git status
- [ ] **Step 5:** Commit with message "chore: remove landing page and components"

---

## Task 2: Refactor Root Layout and Add Dashboard Redirect

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/page.tsx` (redirect only)

**Steps:**

- [ ] **Step 1:** Read current `app/layout.tsx`
- [ ] **Step 2:** Simplify layout, remove landing-specific imports
- [ ] **Step 3:** Create redirect page at root → `/dashboard`
- [ ] **Step 4:** Verify TypeScript compilation (no errors)
- [ ] **Step 5:** Commit with message "refactor: simplify layout, redirect root to dashboard"

---

## Task 3: Optimize Next.js Config for Performance

**Files:**
- Modify: `next.config.ts`

**Steps:**

- [ ] **Step 1:** Read current `next.config.ts`
- [ ] **Step 2:** Add performance optimizations (turbopack, caching, image optimization)
- [ ] **Step 3:** Verify TypeScript (no errors)
- [ ] **Step 4:** Test build (`npm run build`)
- [ ] **Step 5:** Commit with message "perf: optimize next.js config for faster build and caching"

---

## Task 4: Implement Lazy Loading in Heavy Pages

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/applications/[id]/page.tsx`

**Steps:**

- [ ] **Step 1:** Review dashboard and detail pages for heavy components
- [ ] **Step 2:** Add dynamic imports with loading states for non-critical sections
- [ ] **Step 3:** Test pages in dev mode (`npm run dev`)
- [ ] **Step 4:** Verify bundle size reduction in build output
- [ ] **Step 5:** Commit with message "perf: lazy-load non-critical components"

---

## Task 5: Optimize Sync Engine (Memory Leaks, Debounce)

**Files:**
- Modify: `lib/sync-engine.ts`

**Steps:**

- [ ] **Step 1:** Review sync-engine for listener management and cleanup
- [ ] **Step 2:** Add debouncing helper and apply to listener notifications
- [ ] **Step 3:** Ensure proper cleanup in `useSyncEngineSnapshot` hook
- [ ] **Step 4:** Test in dev mode, check browser console for warnings
- [ ] **Step 5:** Test sync functionality (click "Проверить сейчас")
- [ ] **Step 6:** Commit with message "perf: optimize sync-engine with debouncing and cleanup"

---

## Task 6: Add Electron System Tray and Background Mode

**Files:**
- Create: `electron/tray-menu.ts`
- Modify: `electron/main.js`

**Steps:**

- [ ] **Step 1:** Create tray menu file with context menu and click handlers
- [ ] **Step 2:** Read current `electron/main.js`
- [ ] **Step 3:** Add tray creation and background mode (minimize to tray on close)
- [ ] **Step 4:** Update activate handler to show/hide instead of creating new window
- [ ] **Step 5:** Test in dev mode (`npm run electron-dev`)
- [ ] **Step 6:** Commit with message "feat: add electron system tray and background mode"

---

## Task 7: Configure Windows Auto-Start via Electron Builder

**Files:**
- Create: `scripts/register-autostart.mjs`
- Modify: `package.json`
- Modify: `electron/main.js`

**Steps:**

- [ ] **Step 1:** Create auto-start registration script for Windows registry
- [ ] **Step 2:** Update `package.json` build section (nsis, icons, installer config)
- [ ] **Step 3:** Update `electron/main.js` to handle single instance lock
- [ ] **Step 4:** Add post-install hook to register auto-start
- [ ] **Step 5:** Test build (`npm run electron-build-exe`)
- [ ] **Step 6:** Commit with message "feat: configure windows auto-start via electron builder"

---

## Task 8: Performance Testing and Verification

**Files:**
- No code changes, testing only

**Steps:**

- [ ] **Step 1:** Start dev server, test dashboard load time (<2s)
- [ ] **Step 2:** Test adding new application (PDF upload, parsing, saving)
- [ ] **Step 3:** Test status checking (load state, sync update)
- [ ] **Step 4:** Test auto-check in settings (1-minute interval, background behavior)
- [ ] **Step 5:** Test Electron app (tray functionality, minimize/show, background)
- [ ] **Step 6:** Check performance metrics (Lighthouse, bundle sizes)
- [ ] **Step 7:** Commit any test notes with message "docs: add performance testing notes"

---

## Task 9: Final Cleanup and Verification

**Files:**
- No code changes, verification only

**Steps:**

- [ ] **Step 1:** Check git status (working tree clean)
- [ ] **Step 2:** Review commit log (all tasks properly committed)
- [ ] **Step 3:** Run linter (`npm run lint`)
- [ ] **Step 4:** Final build test (`npm run build`)
- [ ] **Step 5:** Verify all tasks completed in TodoWrite
- [ ] **Step 6:** Summary of all commits

---

## Context Notes

**Current Status:**
- Working in worktree: `codex-local-no-supabase`
- Current port: 3001 (3000 in use)
- Project has: sync-engine, Telegram integration, archive, settings pages
- Landing page needs removal to streamline the app
- Performance optimization needed for faster load times
- Windows auto-start required for background operation

**Key Files to Know:**
- `lib/local-db.ts` — local JSON persistence (don't modify unless needed)
- `lib/sync-engine.ts` — background sync scheduler
- `electron/main.js` — Electron main process
- `app/dashboard/page.tsx` — main operational dashboard
- `next.config.ts` — Next.js build configuration

**Testing:**
- Dev server: `npm run dev` (port 3001)
- Electron dev: `npm run electron-dev`
- Build: `npm run build`
- Lint: `npm run lint`
