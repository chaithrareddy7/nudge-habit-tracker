# Nudge — Project Memory

Context to load at the start of any work session (human or AI). Keep it short and current; details live in the linked docs.

_Last updated: 2026-10-08_

## What this is

**Nudge** is a personal productivity OS: planner (day/week/month/calendar), focus timer, habits and streaks, goals and projects, journal, reviews, analytics and insights, all connected through dated records. Loop: **Plan → Track → Reflect → Improve**. Full scope: [prd.md](prd.md).

## Where things are

| Thing | Location |
| --- | --- |
| Repo (local) | `/Users/chaithra/Downloads/habit tracker` |
| GitHub | `https://github.com/chaithrareddy7/nudge-habit-tracker` (branch `main`, last commit `62c59f0`) |
| Supabase project | ref `jombigwxqzgslqryblai` (URL in `.env.example`; real key only in the git-ignored `.env`) |
| Active migration | `supabase/migrations/20261001000000_nudge_productivity_os.sql` (applied by the owner) |
| Hosting target | Vercel (`vercel.json` ready; not deployed yet) |
| Owner's dev server | usually `http://localhost:5176` (owner's own `vite --host`; don't stop it) |
| Docs | `README.md` (setup and deploy), `docs/*` (this set), in-app Guide `src/screens/Guide.tsx` |

## Mental model (30 seconds)

- One `Workspace` object (`src/lib/model.ts`) in `useStore()` (`src/lib/store.tsx`), saved to `localStorage['nudge-os-v1']`, synced to Supabase `nudge_*` tables when signed in.
- Every number is derived in `src/lib/selectors.ts`; nothing aggregated is stored.
- All create/edit forms live in `src/shell/editors.tsx` → `useEditors().open({ kind })`.
- Screens are `src/screens/*.tsx` (lazy-loaded) with prefixed CSS; tokens in `src/styles/theme.css`.
- Details: [architecture.md](architecture.md) · rules: [rules.md](rules.md) · visuals: [design.md](design.md).

## Decisions already made (don't re-litigate without reason)

- Local-first, account optional; remote wins on sign-in unless the account is empty.
- snake_case fields = DB columns; text ids; `(user_id, id)` PKs with same-user composite FKs; RLS everywhere.
- New `nudge_*` tables instead of reusing the legacy tables (legacy schemas were incompatible and possibly already applied).
- Local date keys; weeks start Monday; blocks use minutes after midnight.
- **Default theme is `light`** (blush brand is light-first); dark mode is fully supported. This default was changed from `system` by someone else and kept intentionally.
- One "Planner" nav item with view tabs; Calendar is a view of the Planner.
- Pink is reserved for actions and highlights; surfaces are neutral.
- Plain CSS + tokens (Tailwind is unused and slated for removal).

## Gotchas

- **Never** use `toISOString().slice(0, 10)` for a day; use `src/lib/dates.ts`.
- **Another tool edits this repo concurrently** (VS Code, probably Copilot). Run `git status` and check modified times before big edits; treat unexpected changes as possibly the owner's.
- Tailwind's `.ring` utility used to clash with the kit's `Ring`; Tailwind is no longer imported, so don't re-add `@import "tailwindcss"`.
- `VITE_*` env vars are baked in at build time; redeploy after changing them.
- After applying migrations, PostgREST may need `notify pgrst, 'reload schema'` (included in the migration).
- Sessions under 60 s are discarded by design.
- The scratchpad (`/private/tmp/...`) is wiped periodically, so test scripts there aren't durable; put real tests in the repo (tasks #6, #7).

## How to verify a change

```bash
npm run build   # types + production build
npm run lint    # 9 known only-export-components warnings are accepted
npm run dev     # check 390px + 1470×700, light + dark, new account + sample data
```

## Current focus / next up

1. Commit and push the rebuild (it's all uncommitted), deploy to Vercel, and configure the Supabase redirect URLs: [tasks.md](tasks.md) P0.
2. Bring an automated test suite into the repo (Playwright + Vitest).
3. Clean-ups: remove Tailwind and unused assets; split the large screen files.

## Owner preferences

- Wants a polished, responsive, production-ready product; reviews the UI on a ~1470×700 laptop viewport and on a phone.
- Likes written docs (README, these files) and step-by-step deployment instructions.
- Commit/push only when asked.
