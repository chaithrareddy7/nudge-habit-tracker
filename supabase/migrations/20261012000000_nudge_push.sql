-- Push notifications: device subscriptions, a send log (never notify twice),
-- and a small queue for snoozed notifications. Idempotent.
--
-- Subscriptions are managed by each user from the app (RLS). The log and the
-- queue are only touched by the `push` Edge Function using the service role,
-- so they have RLS enabled with no policies (no client access).

create table if not exists public.nudge_push_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null, -- sha-256 of the endpoint
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  timezone text not null default 'UTC',
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists nudge_push_subscriptions_endpoint_idx on public.nudge_push_subscriptions (endpoint);

create table if not exists public.nudge_push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null, -- e.g. 2026-10-12:habit:<id>
  sent_on date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists nudge_push_log_user_day_idx on public.nudge_push_log (user_id, sent_on);

create table if not exists public.nudge_push_queue (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null,
  payload jsonb not null,
  sent_at timestamptz
);
create index if not exists nudge_push_queue_due_idx on public.nudge_push_queue (due_at) where sent_at is null;

alter table public.nudge_push_subscriptions enable row level security;
alter table public.nudge_push_log enable row level security;
alter table public.nudge_push_queue enable row level security;

drop policy if exists "Users manage own push subscriptions" on public.nudge_push_subscriptions;
create policy "Users manage own push subscriptions" on public.nudge_push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
