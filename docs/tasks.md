# Nudge — Tasks & Progress

Living task list. Update it whenever work starts or finishes.
Legend: ✅ done · 🔄 in progress · ⬜ to do · 🧊 parked. Priority: **P0** blocking release · **P1** next · **P2** later.

_Last updated: 2026-10-08_

---

## Current status

The v1 feature set is built, polished and verified locally. **Nothing since commit `62c59f0` is committed**; the app is not yet deployed.

---

## P0: Release

| # | Task | Status | Notes |
| --- | --- | --- | --- |
| 1 | Commit the productivity-OS rebuild on a branch and push to GitHub (`chaithrareddy7/nudge-habit-tracker`) | ✅ | Decide whether to commit `.archify/` (diagram output) or add it to `.gitignore` |
| 2 | Apply `supabase/migrations/20261001000000_nudge_productivity_os.sql` to the Supabase project | ✅ | Owner applied it; the app shows "Synced" |
| 3 | Import the repo in Vercel, set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`, deploy | ✅ | Live at https://nudge-habit-tracker-three.vercel.app |
| 4 | Supabase Auth → URL configuration: Site URL + `https://<app>.vercel.app/**` redirect | ⬜ | Otherwise magic links return to localhost |
| 5 | Post-deploy smoke test: deep-link refresh (`/plan/week`), sign-in, sync, install as PWA on a phone | ⬜ | |

## P1: Next

| # | Task | Status | Notes |
| --- | --- | --- | --- |
| 6 | Add an automated test suite in the repo (Playwright) | ⬜ | Port the 29 ad-hoc end-to-end checks (onboarding, tasks, goals, habits, timer, manual sessions, planner tabs, timeline drag, week "Move to", weekly review, journal, search, analytics, guide, settings, backup import, goal delete, persistence) at 1470×700 and 390×844 |
| 7 | Unit tests for `selectors.ts` (streaks, goal progress, plan vs actual, habit rates) | ⬜ | Pure functions, easy to cover with Vitest |
| 8 | Remove unused Tailwind (`tailwindcss`, `@tailwindcss/vite`, plugin line) and unused `src/assets/*`, `public/icons.svg` | ⬜ | |
| 9 | Week board touch drag-and-drop (pointer events instead of HTML5 DnD) | ⬜ | "Move to…" works today |
| 10 | Web Push reminders while the app is closed (VAPID + Supabase Edge Function scheduler) | ⬜ | PRD §6.12 |
| 11 | Count-based goals ("20 workouts") | ⬜ | Needs `target_count` + habit/session counting |
| 12 | CI: GitHub Action running `npm ci && npm run build && npm run lint` (+ tests) on pull requests | ⬜ | |

## P2: Later

| # | Task | Status |
| --- | --- | --- |
| 13 | Move journal photos to Supabase Storage (avoid the ~5 MB localStorage cap) | ⬜ |
| 14 | Sync conflict handling beyond last-write-wins (per-row `updated_at` compare) | ⬜ |
| 15 | Split large screens (`DayPlanner.tsx`, `Goals.tsx`, `WeekPlanner.tsx`, `Analytics.tsx`) into subcomponents | ⬜ |
| 16 | Move hooks and constants out of `store.tsx`, `kit.tsx`, `editors.tsx`, `PlannerTabs.tsx` to silence `only-export-components` warnings | ⬜ |
| 17 | Privacy-respecting product analytics for PRD success metrics | ⬜ |
| 18 | Calendar import (ICS / Google) | 🧊 |
| 19 | Decide on legacy tables from migrations `20260928/29/30` (old habits/tasks/focus_sessions/goals…); drop in a new migration once confirmed unused | ⬜ |
| 20 | Sessions that cross midnight: optionally split across both days | 🧊 |

---

## Done (history)

### 2026-09-28: Productivity OS rebuild
- ✅ Connected data model (14 entities), local-first store, Supabase sync queue, selectors layer
- ✅ Today, Focus timer, Day/Week/Month planners, Calendar, Goals, Habits, Tasks, Journal, Analytics, Insights, Search, Settings, Onboarding, sample data
- ✅ Quick Add, floating timer, global stop dialog, reminders (in-app), streak celebrations
- ✅ Supabase migration with `(user_id, id)` keys, same-user composite FKs, RLS; tested on Postgres 16 (idempotent, cross-user guard, set-null, RLS)
- ✅ Light/dark themes, PWA, lazy-loaded screens
- ✅ Fixed: UTC date keys, archived habits losing history, timer goal parts, nested buttons in star ratings, Tailwind `.ring` clash

### 2026-10-02: Docs and hosting
- ✅ README (stack, structure, data model, rules, Supabase, Vercel)
- ✅ `vercel.json` (SPA rewrites, caching)
- ✅ Migration made standalone (creates `profiles`, reloads the PostgREST schema cache)

### 2026-10-04: UX overhaul / production readiness
- ✅ Neutral surfaces (pink only for actions), compact headers, cards and empty states
- ✅ Navigation consolidated to 9 items; one Planner with Day/Week/Month/Calendar tabs that remembers the last view
- ✅ Today: hero compacted (content starts ~323 px on 1470×700), Getting started checklist, evening check-in merged into the card
- ✅ Planners: slim header, stat strip, timeline/board/calendar above the fold, collapsible side sections, neutral week board
- ✅ Goals and Habits templates for new users; Tasks and Journal mobile layouts; Analytics/Insights/Search empty states and density
- ✅ In-app Guide (`/guide`), error boundary, backup import, PNG/maskable/apple-touch icons, per-screen titles, skip link, larger touch targets
- ✅ Fixed: "Load sample data" didn't delete old cloud rows
- ✅ Verified: 29/29 end-to-end checks at laptop and phone sizes; 75 screenshot loads (new/sample, laptop/phone, light/dark) with no errors or horizontal overflow

### 2026-10-10: Progress analytics + procrastination support
- ✅ Analytics → **Progress** tab (default): this-week momentum vs the same days last week, 26-week show-up calendar (focus, habits, tasks, journal) with runs and strongest weekday, 8-week trends (focus, habits, tasks), "Getting started" (typical first start, blocks started on time/late/not started, average delay, tailored tip), goal progress. Works for brand-new accounts
- ✅ **Just 5 minutes** starter on Today and Timer (`active_timer.goal_seconds`); a kind nudge at 5:00 with "Stop here"; first session of the day celebrated; afternoon "not started yet" copy
- ✅ Verified: 7/7 five-minute flow checks, Progress tab at laptop/phone, light/dark, new account and sample data

### 2026-10-10: Customisable Today dashboard
- ✅ Today cards (schedule, tasks, habits, check-in, goals, streaks, coming up, numbers) in balanced 1/2/3 columns based on available width
- ✅ Customize mode: drag and drop with mouse and touch (`@dnd-kit`), arrow-key moves (↑↓ within a column, ←→ between columns) with screen-reader announcements, hide/restore, reset; saved per column count in `settings.dashboard` (synced)
- ✅ Verified: 13 board checks at 1470×700 and tablet width, real touch drag on a 390 px phone, 17/17 routes clean (laptop light with sample data, phone dark with a new account)

### 2026-10-08: Project docs
- ✅ `docs/prd.md`, `architecture.md`, `rules.md`, `design.md`, `tasks.md`, `memory.md`

---

## Known issues

| Issue | Impact | Workaround |
| --- | --- | --- |
| Reminders only fire while the app is open | Missed reminders when closed | Keep the installed PWA open; Web Push planned (#10) |
| Week board drag doesn't work on touch | Phones | Use the "Move to…" menu |
| Last-write-wins sync | Simultaneous edits on two devices | Rare for single users |
| Photos stored inline | Storage cap ~5 MB | Remove old photos; Storage planned (#13) |
| 9 `only-export-components` lint warnings | Fast refresh only | Accepted (#16) |
