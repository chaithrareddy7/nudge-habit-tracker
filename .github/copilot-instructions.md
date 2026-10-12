# Nudge project guidance

Read `docs/memory.md` first, then follow `docs/rules.md` (coding), `docs/design.md` (UI) and `docs/architecture.md`. Track work in `docs/tasks.md`, and update `README.md` + the related `docs/*` with every change that is pushed.

- React 19, TypeScript, Vite, plain CSS with the tokens in `src/styles/theme.css` (light + dark). Reuse `src/ui/kit.tsx` and `src/ui/widgets.tsx`.
- Data lives in one workspace (`src/lib/model.ts`) managed by `useStore()` in `src/lib/store.tsx`. Create/update/remove rows through the store; open entity forms with `useEditors().open(...)` from `src/shell/editors.tsx`.
- Every aggregate (day/week/month totals, goal progress, streaks, plan vs actual) comes from `src/lib/selectors.ts`. Don't store derived totals.
- Date keys are local `yyyy-MM-dd` from `src/lib/dates.ts`; never use `toISOString().slice(0, 10)` for a day.
- Supabase: only the public anon key; all `nudge_*` tables are user-scoped by RLS with same-user composite foreign keys. Never add service-role credentials to frontend code. Keep the app fully usable without Supabase.
- Calm, supportive copy; no shame-based language.
- Run `npm run build` and `npm run lint` after changes.
