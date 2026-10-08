# Nudge — Product Requirements (PRD)

| | |
| --- | --- |
| **Product** | Nudge, a personal productivity OS |
| **Owner** | Chaithra (GitHub `chaithrareddy7`) |
| **Status** | v1 feature-complete and polished locally; not yet deployed |
| **Last updated** | 2026-10-08 |
| **Related** | [architecture.md](architecture.md) · [design.md](design.md) · [tasks.md](tasks.md) |

---

## 1. Problem

People who want to be intentional with their time end up juggling a to-do app, a calendar, a habit tracker, a time tracker and a journal. None of them talk to each other, so nobody can answer the questions that matter:

- What should I do right now?
- What am I actually doing, and how much time did it take?
- Am I staying consistent?
- Am I making progress on what matters?
- What should I change next week?

## 2. Product vision

One app built around a single loop, **Plan → Track → Reflect → Improve**, where everything is connected through time:

> **Goals → Months → Weeks → Days → Tasks / Habits → Productive time → Reviews → Insights**

Anything recorded once (a session, a habit check-in, a task) automatically counts toward its day, week, month, year, goal, planned block, category, streaks and analytics. **No double entry, no duplicated data.**

## 3. Target users

| Persona | Needs |
| --- | --- |
| **Self-directed builder** (developer, student, freelancer) | Hit hour targets on goals (e.g. "30 hours of coding this month"), protect deep-work time, see plan vs reality |
| **Habit builder** | Simple daily rituals with streaks; low friction on mobile |
| **Reflective planner** | Weekly and monthly reviews informed by real data, plus a journal |

Primary device: laptop for planning and analytics; phone for Today, the timer and habits.

## 4. Goals and non-goals

**Goals**
1. Make planned vs actual time visible every day and week (the signature feature).
2. Make goal progress automatic, derived from tracked sessions and tasks.
3. Make consistency visible through streaks, without being childish or gamified.
4. Keep logging a session, ticking a habit or capturing a task under 3 taps or seconds.
5. Work fully offline and without an account; sync is optional.

**Non-goals (v1)**
- Team or shared workspaces, collaboration.
- Calendar import/export (Google/Outlook/ICS).
- Native mobile apps (the PWA covers mobile).
- AI coaching or automatic scheduling.
- Push notifications while the app is closed.

## 5. Product principles

1. **Connected, not duplicated**: store facts once and derive every total.
2. **Plan → Track → Reflect → Improve** is visible on every screen.
3. **Calm, supportive tone**: no shame copy, subtle celebrations.
4. **Fast capture everywhere**: Quick Add (`N`), the floating timer, one-tap habits.
5. **Local-first**: the app is useful from the first second, with nothing to set up.
6. **Progressive disclosure**: new users get a Getting started path, templates and a Guide, not a wall of empty cards.

## 6. Functional requirements

Status: ✅ shipped · 🟡 partial · ⬜ not started

### 6.1 Today (dashboard), `/today`
| Requirement | Status |
| --- | --- |
| Date, greeting, editable main focus for the day | ✅ |
| Productive time vs daily target (live, including the running timer), progress % | ✅ |
| Start/pause/stop the timer inline; one-tap start of the planned block happening now | ✅ |
| Today's schedule (blocks + events) with a "now" line and tracked-vs-planned per block | ✅ |
| Today's tasks, habits, active goals, current streaks, upcoming events (7 days) | ✅ |
| Quick check-in (mood + one line) with an evening nudge | ✅ |
| Daily summary: sessions, average length, top category, plan vs reality | ✅ |
| Getting started checklist for new accounts (dismissible) | ✅ |

### 6.2 Productive hours tracker, `/timer`
| Requirement | Status |
| --- | --- |
| Category (built-in + custom) → goal → goal part → optional label → start | ✅ |
| Live timer, pause, resume, stop; survives reload; synced across devices | ✅ |
| On stop: optional 1–5 rating, notes, change category/goal | ✅ |
| Auto-link the session to the planned focus block happening now | ✅ |
| Store start, end, duration (excluding pauses), category, goal, part, task, block, rating, notes, date, label, source | ✅ |
| Manual add and edit of sessions; sessions under 60 s are discarded | ✅ |

### 6.3 Analytics, `/analytics`
| Requirement | Status |
| --- | --- |
| Today: hours, sessions, average session, goal progress | ✅ |
| Week: total, daily average, best day, top category, planned vs actual, vs last week | ✅ |
| Month: total vs target, %, best day, best time of day, top category, average, productive days | ✅ |
| All time: total, longest session, longest streak, best month, top category | ✅ |
| Charts: by category, by day, planned vs actual, weekly/monthly trends, weekday × hour heatmap, "View as table" | ✅ |

### 6.4 Planner: Day / Week / Month / Calendar, `/plan`
| Requirement | Status |
| --- | --- |
| Single "Planner" entry with view tabs; remembers the last view | ✅ |
| Day: timeline with drag-to-move, drag-to-resize, drag-to-create, 15-min snap; actual-time lane | ✅ |
| Day: tasks, backlog, habits, events, notes, reflection, goals touched, plan vs reality | ✅ |
| Week: Mon–Sun columns with hours vs target, editable daily and weekly targets, blocks, events, tasks, habits | ✅ |
| Week: drag tasks and blocks between days (+ "Move to…" fallback, undo) | ✅ |
| Week: weekly goals, plan vs reality, **Weekly review**, **Plan next week** | ✅ |
| Month: calendar with hours, heat, habit dots, journal and goal markers, important events; monthly goals, **Monthly review** | ✅ |
| Calendar: unified month / week / agenda layouts | ✅ |
| Touch drag-and-drop on the week board | 🟡 "Move to…" works; native drag events don't fire on phones |

### 6.5 Goals and projects, `/goals`
| Requirement | Status |
| --- | --- |
| Long-term, monthly and weekly goals, projects; sub-goals (parent) | ✅ |
| Title, description, category, start, deadline, target hours, weekly target, parts breakdown, colour | ✅ |
| Progress from linked sessions (hours) or tasks; pace check (ahead / on track / behind) | ✅ |
| Detail: hours over time vs ideal pace, parts, tasks, habits, sessions, planned blocks, streak | ✅ |
| Templates for first-time users | ✅ |
| Count-based targets (e.g. "exercise 20 times") | ⬜ approximated with hours or tasks |

### 6.6 Habits, `/habits`
| Requirement | Status |
| --- | --- |
| Daily, n× per week, or specific weekdays; target amount + unit; reminder; start/end; category; linked goal | ✅ |
| Current and longest streak, 7/30/90-day rate, calendar history, weekly/monthly performance | ✅ |
| Appear automatically in the Today, Day, Week and Month views | ✅ |
| Archive keeps history; templates for first-time users | ✅ |

### 6.7 Streaks
| Requirement | Status |
| --- | --- |
| Productivity (daily minimum), weekly target, habit, goal and category streaks | ✅ |
| Milestone and personal-best celebrations (subtle) | ✅ |

### 6.8 Journal, `/journal`
| Requirement | Status |
| --- | --- |
| Mood, energy, prompts (day, went well, distractions, tomorrow's priority), highlights, challenges, gratitude, notes | ✅ |
| Photos (resized client-side, max 8/day); autosave; history + search; mood/energy trend | ✅ |
| "Add tomorrow's priority as a task" | ✅ |

### 6.9 Plan vs Reality
Per-category planned vs actual with over/under amounts, an efficiency %, and a "blocks followed through" %, shown on Today, Day, Week and Analytics. ✅

### 6.10 Search, `/search`
Full-text search across every entity; category and goal summary cards; date and period queries ("September", "last week", "2026-09-28", "sep 28"). ✅

### 6.11 Insights, `/insights`
Generated plain-language insights, "What to focus on next", streak milestones, week/month/year comparisons, best days and times, planning accuracy. ✅

### 6.12 Reminders
| Requirement | Status |
| --- | --- |
| Habits, tasks, planned blocks (at start), events (10 min before), journal, planning, weekly and monthly review, custom | ✅ while the app is open |
| Customisable times and days; browser notifications if permitted | ✅ |
| Delivery while the app is closed (Web Push) | ⬜ |

### 6.13 Quick Add
Global "+" and `N`: task, habit, goal, event, time block, start timer, past session, journal, note. ✅

### 6.14 Accounts, sync, data
| Requirement | Status |
| --- | --- |
| Works without an account (localStorage) | ✅ |
| Email magic link + Google sign-in (Supabase) | ✅ |
| Background sync; first sign-in uploads local data; existing account loads cloud data | ✅ |
| Export and import JSON backup; sample data; start fresh | ✅ |
| Conflict resolution beyond last-write-wins | ⬜ |

### 6.15 Onboarding and help
Five-step onboarding (name → targets → goals → habits → plan the week) or "Explore with sample data"; Getting started checklist; in-app Guide (`/guide`). ✅

### 6.16 Platform
Responsive from 360 px phones to wide desktops; light and dark themes; installable PWA with icons; offline app shell; keyboard shortcuts (`N`, `T`, `/`). ✅

## 7. Key user flows

1. **First run**: onboarding (or sample data) → Today with Getting started → set a goal → add habits → Plan next week.
2. **Daily**: Today → set main focus → start the timer on a planned block → tick habits and tasks → evening check-in.
3. **Weekly (Sunday)**: Week planner → Weekly review (auto stats + prompts) → Plan next week (carry over tasks, copy blocks, set target).
4. **Monthly**: Month planner → Monthly review → adjust goals and targets using Analytics and Insights.

## 8. Success metrics (once deployed)

| Metric | Target |
| --- | --- |
| Activation: finish ≥ 4 of 6 Getting started steps in week 1 | 50% of new accounts |
| Weekly active trackers: ≥ 3 days with a session per week | 40% of activated users |
| Planning adoption: weeks with ≥ 5 focus blocks planned | 30% of active weeks |
| Review completion: weekly review answered | 25% of active weeks |
| Plan efficiency trend: median efficiency moves toward 80–110% over 4 weeks | — |

No analytics or telemetry exists yet; see [tasks.md](tasks.md).

## 9. Constraints

- Frontend-only (static SPA) plus Supabase; no custom server.
- Supabase anon key in the browser; all data protected by RLS.
- Browser storage is about 5 MB (photos count toward it).
- Local dates only; weeks start on Monday.

## 10. Open questions and roadmap candidates

- Web Push reminders (needs VAPID keys and a server-side sender, e.g. a Supabase Edge Function).
- Count-based goals ("20 workouts").
- Calendar import (ICS / Google).
- Photo storage in Supabase Storage instead of inline data URLs.
- Product analytics (privacy-respecting) to measure the metrics above.
- Week-board touch drag-and-drop.
