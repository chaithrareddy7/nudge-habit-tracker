# Nudge — Coding Rules

Rules for anyone (human or AI assistant) changing this codebase. The reasons behind them are in [architecture.md](architecture.md); the visual rules are in [design.md](design.md).

**Golden rule:** store a fact once, derive everything else.

---

## 1. Before you change anything

1. Run `git status` and check recent file times. Another tool has edited this repo concurrently before, so don't overwrite changes you didn't make without asking.
2. Read the relevant part of `src/lib/model.ts`, `selectors.ts` and `store.tsx` before touching data code.
3. Check whether `src/ui/kit.tsx`, `src/ui/widgets.tsx` or `src/shell/editors.tsx` already has what you need.

## 2. TypeScript and formatting

- TypeScript only; no `any` (use `unknown` and narrow). Keep the build free of type errors.
- Style: 2-space indent, **no semicolons**, single quotes, trailing commas in multi-line literals. Match surrounding code.
- Readable code over clever one-liners. Comment the *why*, not the *what*.
- Prefer `type` aliases; components are function components; hooks follow the Rules of Hooks.
- Named exports for shared modules; **default export for each screen** (it's lazy-loaded).

## 3. Data and state

- **All writes go through `useStore()`**: `create`, `update`, `remove`, or a domain action. Never mutate `ws` or write localStorage directly (except per-device UI conveniences such as the remembered planner view or recent searches, always wrapped in `try/catch`).
- **All aggregation lives in `src/lib/selectors.ts`.** Don't compute totals, streaks or progress inside components. If a screen needs a one-off helper, keep it pure and local; promote it to `selectors.ts` when a second screen needs it.
- **Never store derived values** (totals, percentages, streak counts).
- **Entity forms**: open with `useEditors().open({ kind, id?, defaults? })`. Don't build a second form for an entity.
- **New field**: add it to `model.ts` (and its default), write a **new** migration (`alter table … add column if not exists`), and handle a missing value when reading older local data.
- **New collection**: type + default in `emptyWorkspace()`, a table in `TABLES` placed **after** any table it references, a migration with the `(user_id, id)` key, composite FKs and the standard RLS policy, and delete-unlinking in `store.remove()` if others reference it.
- Settings changes go through `updateSettings(patch)`.

## 4. Dates and time

- Day keys are local `yyyy-MM-dd` from `src/lib/dates.ts` (`todayKey()`, `toKey(date)`, `shiftKey`, `weekStartKey`…).
- **Never** derive a day with `toISOString().slice(0, 10)`; it's UTC and shifts evening activity to the next day.
- Weeks start on **Monday**. Time-of-day is minutes after midnight (`start_min`, `end_min`).
- Durations are **seconds** in data and charts; format with `formatDuration` / `formatClock`.

## 5. Routing

- Build URLs with `src/lib/routes.ts`; navigate with `<Link>` / `useNavigate()`. Never use `location.href` / `window.location.assign` for in-app navigation.
- Keep screen state that should survive a refresh or be shareable (date, tab, view, query) in search params.
- New screen: `lazy()` import + `<Route>` in `App.tsx`, a `routes.ts` helper, a nav entry in `AppShell.tsx` if needed, a title in the AppShell title effect, and a section in the in-app Guide (`src/screens/Guide.tsx`).

## 6. Styling

- Use **tokens only** (`var(--surface)`, `var(--ink-2)`, `var(--accent)`…). No raw hex in screen CSS, so light and dark mode both work.
- Data colours (categories, goals, habits) go through `useSeriesColor()` so they switch to dark-mode steps.
- Each screen has its own CSS file with **screen-prefixed class names** (`today-`, `week-`, `goals-`…). Shared styles belong in `theme.css` (or `widgets.css` for widgets).
- No inline style objects except for dynamic values (widths, colours from data, CSS variables).
- Mobile first: verify at **360–390 px** and the owner's **1470×700** laptop viewport. No horizontal page scroll; wide content goes in its own `overflow-x: auto` box.
- Touch targets ≥ 40 px on coarse pointers.

## 7. Components and UX

- Wrap screens in `<Page eyebrow title subtitle actions>`; use `Card`, `Button`, `Empty`, `Modal`, `Segmented`, `Stat`, etc. from the kit.
- Empty states are **compact** (one line + one action). Never show zero-filled charts; show a short message instead.
- Destructive actions use `ConfirmButton` (two-step), never `window.confirm`.
- Every icon-only button needs `aria-label`. Charts need a text alternative ("View as table").
- Feedback via `useToast()`; no `alert()`.
- Copy: calm, supportive, specific. No shame ("You failed…"), no exclamation spam, no childish gamification.

## 8. Charts (Recharts)

- Pick the form by its job: stat tile for a single number, bars or lines over time, horizontal bars for category share, heatmap for weekday × hour.
- Categorical colours by **entity** (never by rank); planned = `var(--planned)`, actual / single series = `var(--accent)`.
- Thin bars with 4 px rounded data-ends, recessive grid (`var(--line)`, horizontal only), no axis lines, **no dual y-axes**.
- Tooltip on every chart (`ChartTooltip`); a legend when there are ≥ 2 series.

## 9. Security and privacy

- Only `VITE_SUPABASE_URL` and the **anon/publishable** key in the frontend. Never a service-role key.
- Every table: `(user_id, id)` primary key, composite same-user FKs, RLS `user_id = auth.uid()`.
- Don't render user content as HTML (`dangerouslySetInnerHTML` is not used anywhere; keep it that way).
- Don't log personal data.

## 10. Database migrations

- Never edit a migration that may already be applied; add a new timestamped file in `supabase/migrations/`.
- Make migrations idempotent (`if not exists`, `drop policy if exists`) and end schema changes with `notify pgrst, 'reload schema';`.
- Test locally if possible: `docker run postgres:16-alpine` with an `auth` schema stub, apply every migration in order, twice.

## 11. Verification checklist (before calling work done)

1. `npm run build`: zero type errors, successful build.
2. `npm run lint`: no new warnings. The `only-export-components` warnings on `store.tsx`, `kit.tsx`, `editors.tsx` and `PlannerTabs.tsx` are known and accepted.
3. Run the app (`npm run dev`) and exercise the change. For UI, check 390 px and 1470×700, light and dark, a new account and sample data (Settings → Load sample data).
4. No console errors.
5. **Every push updates the docs:** `README.md`, the related files in `docs/` (tasks, memory, prd, architecture, design as relevant) and the in-app Guide for user-facing changes. Update [tasks.md](tasks.md).
6. Notification logic changed? Run `npm run test:notify`.

## 12. Git

- Branch off `main` for changes; commit only when asked.
- Small, descriptive commits ("Add count-based goals", not "fixes").
- Never commit `.env`, `dist/` or `node_modules/`.
