-- Nudge productivity OS: connected, user-scoped entities.
--
-- Every row is keyed by (user_id, id) and every reference is a composite
-- foreign key that includes user_id, so a row can only ever point at the same
-- user's goals/tasks/blocks/habits. Week, month and year totals are derived
-- from dated rows in the app; nothing is stored twice.
--
-- Idempotent: safe to run more than once. Independent of the earlier
-- habits/tasks/focus_sessions tables, which this app no longer uses.

create extension if not exists pgcrypto;

-- Profiles (normally created by the initial migration; created here too so this
-- file can be pasted on its own into the Supabase SQL editor).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text default 'Asia/Kolkata',
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Profile-level settings (targets, theme, active timer, reminders prefs).
alter table public.profiles add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.nudge_categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 1 and 60),
  color text not null,
  builtin boolean not null default false,
  primary key (user_id, id)
);

create table if not exists public.nudge_goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  category text not null default 'Personal',
  horizon text not null default 'monthly' check (horizon in ('long_term', 'monthly', 'weekly', 'project')),
  parent_id text,
  start_date date not null default current_date,
  deadline date,
  target_hours numeric(8, 2) not null default 0 check (target_hours >= 0),
  weekly_target_hours numeric(6, 2) not null default 0 check (weekly_target_hours >= 0),
  parts jsonb not null default '[]'::jsonb,
  color text not null default '#c45d82',
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, parent_id) references public.nudge_goals (user_id, id) on delete set null (parent_id)
);

create table if not exists public.nudge_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null check (char_length(title) between 1 and 500),
  notes text not null default '',
  date date,
  done boolean not null default false,
  done_at timestamptz,
  goal_id text,
  category text not null default 'Work',
  estimate_minutes int not null default 0 check (estimate_minutes >= 0),
  priority smallint not null default 1 check (priority between 0 and 3),
  reminder_time text check (reminder_time is null or reminder_time ~ '^\d{2}:\d{2}$'),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, goal_id) references public.nudge_goals (user_id, id) on delete set null (goal_id)
);

create table if not exists public.nudge_time_blocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  date date not null,
  start_min int not null check (start_min between 0 and 1440),
  end_min int not null check (end_min between 0 and 1440),
  kind text not null default 'focus' check (kind in ('focus', 'break')),
  category text not null default 'Work',
  goal_id text,
  task_id text,
  reminder boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint nudge_time_blocks_range check (end_min > start_min),
  foreign key (user_id, goal_id) references public.nudge_goals (user_id, id) on delete set null (goal_id),
  foreign key (user_id, task_id) references public.nudge_tasks (user_id, id) on delete set null (task_id)
);

create table if not exists public.nudge_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  date date not null,
  start_min int check (start_min between 0 and 1440),
  end_min int check (end_min between 0 and 1440),
  location text not null default '',
  notes text not null default '',
  important boolean not null default false,
  reminder boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint nudge_events_range check (start_min is null or end_min is null or end_min > start_min)
);

create table if not exists public.nudge_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  date date not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds int not null check (duration_seconds >= 0),
  category text not null default 'Work',
  goal_id text,
  goal_part_id text,
  task_id text,
  block_id text,
  rating smallint check (rating between 1 and 5),
  notes text not null default '',
  source text not null default 'timer' check (source in ('timer', 'manual')),
  label text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, goal_id) references public.nudge_goals (user_id, id) on delete set null (goal_id),
  foreign key (user_id, task_id) references public.nudge_tasks (user_id, id) on delete set null (task_id),
  foreign key (user_id, block_id) references public.nudge_time_blocks (user_id, id) on delete set null (block_id)
);

create table if not exists public.nudge_habits (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 1 and 120),
  icon text not null default '🌱',
  color text not null default '#c45d82',
  category text not null default 'Personal',
  frequency jsonb not null default '{"type":"daily"}'::jsonb,
  target_amount int not null default 1 check (target_amount >= 1),
  unit text not null default '',
  reminder_time text check (reminder_time is null or reminder_time ~ '^\d{2}:\d{2}$'),
  start_date date not null default current_date,
  end_date date,
  goal_id text,
  archived boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, goal_id) references public.nudge_goals (user_id, id) on delete set null (goal_id)
);

create table if not exists public.nudge_habit_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  habit_id text not null,
  date date not null,
  amount int not null default 1 check (amount >= 0),
  primary key (user_id, id),
  foreign key (user_id, habit_id) references public.nudge_habits (user_id, id) on delete cascade
);

create table if not exists public.nudge_journal_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  date date not null,
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  body text not null default '',
  went_well text not null default '',
  distractions text not null default '',
  tomorrow_priority text not null default '',
  highlights text not null default '',
  challenges text not null default '',
  gratitude text not null default '',
  notes text not null default '',
  photos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, date)
);

create table if not exists public.nudge_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  text text not null,
  date date,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.nudge_day_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  date date not null,
  target_minutes int check (target_minutes >= 0),
  focus text not null default '',
  primary key (user_id, id),
  unique (user_id, date)
);

create table if not exists public.nudge_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  period text not null check (period in ('week', 'month')),
  start date not null,
  answers jsonb not null default '{}'::jsonb,
  target_minutes int check (target_minutes >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, period, start)
);

create table if not exists public.nudge_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('journal', 'weekly_review', 'monthly_review', 'planning', 'custom')),
  title text not null,
  time text not null check (time ~ '^\d{2}:\d{2}$'),
  days jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  primary key (user_id, id)
);

alter table public.nudge_sessions add column if not exists label text not null default '';

-- Date-range lookups (day → week → month aggregation, calendars, streaks).
create index if not exists nudge_sessions_user_date_idx on public.nudge_sessions (user_id, date);
create index if not exists nudge_sessions_user_goal_idx on public.nudge_sessions (user_id, goal_id) where goal_id is not null;
create index if not exists nudge_time_blocks_user_date_idx on public.nudge_time_blocks (user_id, date);
create index if not exists nudge_tasks_user_date_idx on public.nudge_tasks (user_id, date);
create index if not exists nudge_tasks_user_goal_idx on public.nudge_tasks (user_id, goal_id) where goal_id is not null;
create index if not exists nudge_events_user_date_idx on public.nudge_events (user_id, date);
create index if not exists nudge_habit_completions_user_habit_date_idx on public.nudge_habit_completions (user_id, habit_id, date);
create index if not exists nudge_goals_user_parent_idx on public.nudge_goals (user_id, parent_id) where parent_id is not null;
create index if not exists nudge_habits_user_goal_idx on public.nudge_habits (user_id, goal_id) where goal_id is not null;

-- Row level security: each user can only see and change their own rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'nudge_categories', 'nudge_goals', 'nudge_tasks', 'nudge_time_blocks', 'nudge_events', 'nudge_sessions',
    'nudge_habits', 'nudge_habit_completions', 'nudge_journal_entries', 'nudge_notes', 'nudge_day_plans',
    'nudge_reviews', 'nudge_reminders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Users manage own rows" on public.%I', t);
    execute format(
      'create policy "Users manage own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end
$$;

-- Make the new tables visible to the API immediately.
notify pgrst, 'reload schema';
