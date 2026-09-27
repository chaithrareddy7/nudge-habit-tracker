# Nudge

A calm, mobile-first habit tracker and anti-procrastination to-do app. Nudge is designed around small starts, gentle check-ins, and a short list—not guilt or productivity pressure.

## Get started

Requirements: Node.js 20.19+ or 22.12+, npm, and (for synced data/auth) a Supabase project.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The Supabase publishable/anon key is safe for browser use when Row Level Security is enabled. Never put a service-role key in a frontend environment variable.
3. Apply `supabase/migrations/20260928000000_initial_schema.sql` to the Supabase project using the Supabase SQL editor or CLI.
4. In Supabase Auth, enable Email (magic link) and Google, and configure the Google provider/redirect URLs for your local and deployed app URLs.
5. Run `npm run dev` and open the local Vite URL. Without Supabase environment variables, the app still works as a local-only prototype using browser storage.

## Included

- Routes: `/login`, `/today`, `/habits`, `/tasks`, `/inbox`, `/focus`, `/stats`, `/review`, `/settings`.
- Responsive sidebar/mobile navigation, blush-pink light theme, PWA manifest and service worker.
- Local-first quick capture (`N`), task creation, habit/task check-offs, focus timer (`F`), week navigation shortcut (`T`), stats chart, reflections, and settings.
- Supabase email magic-link sign-in/account creation and Google OAuth, session-aware account settings, and sign-out. The signup profile trigger and RLS-protected schema are in the migration.
- Example habits and tasks are sample content stored in the browser; app content currently uses local storage for the main habit/task/inbox workflows. Auth can be configured independently. Full multi-device data synchronization, realtime CRUD, push subscription delivery, and scheduled weekly-review notifications require connecting those workflows to Supabase and configuring a notification sender.

## Scripts

- `npm run dev` — development server
- `npm run build` — type-check and production build
- `npm run preview` — preview the production build
- `npm run lint` — Oxlint checks

## PWA notes

Vite PWA generates the manifest and service worker during builds. Installability and offline caching require serving the app over HTTPS (localhost is also supported). Browser push needs a push provider/VAPID keys and a server-side sender; do not put provider secrets in the frontend.

## Database

The SQL migration creates `profiles`, `habits`, `habit_logs`, `tasks`, `focus_sessions`, and `weekly_reviews`; enables RLS and user-scoped policies; adds user/date indexes; and creates a profile on signup. The profile trigger runs with a restricted empty search path. Review OAuth callback URLs and RLS behavior before production deployment.
