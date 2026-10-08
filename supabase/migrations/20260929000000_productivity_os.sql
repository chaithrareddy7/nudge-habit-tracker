-- Connected planning + productive-hours entities for Nudge OS.
-- Safe to apply after the initial schema. All user-owned records use RLS.

alter table public.profiles add column if not exists target_hours_day numeric(5,2) not null default 5;
alter table public.profiles add column if not exists target_hours_week numeric(6,2) not null default 30;
alter table public.profiles add column if not exists target_hours_month numeric(7,2) not null default 120;
alter table public.profiles add column if not exists minimum_hours_day numeric(5,2) not null default 1;
alter table public.habits add column if not exists category text not null default 'Personal';
alter table public.habits add column if not exists target_amount numeric(8,2) not null default 1;
alter table public.habits add column if not exists target_unit text not null default 'times';
alter table public.habits add column if not exists start_date date not null default current_date;
alter table public.habits add column if not exists end_date date;
alter table public.habit_logs add column if not exists amount numeric(8,2) not null default 1;
alter table public.tasks add column if not exists category text not null default 'Personal';
alter table public.tasks add column if not exists planned_start_at timestamptz;
alter table public.tasks add column if not exists planned_end_at timestamptz;

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'Personal',
  cadence text not null default 'monthly' check (cadence in ('long_term','yearly','monthly','weekly')),
  start_date date not null default current_date,
  deadline date,
  target_hours numeric(7,2) not null default 0 check (target_hours >= 0),
  color text not null default '#c76588',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tasks add column if not exists goal_id uuid references public.goals(id) on delete set null;

create table if not exists public.productive_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes int not null default 0 check (duration_minutes >= 0),
  category text not null default 'Work',
  goal_id uuid references public.goals(id) on delete set null,
  rating int check (rating between 1 and 5),
  notes text not null default '',
  state text not null default 'complete' check (state in ('running','paused','complete')),
  paused_seconds int not null default 0,
  planned_block_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'Work',
  start_at timestamptz not null,
  end_at timestamptz not null,
  goal_id uuid references public.goals(id) on delete set null,
  kind text not null default 'focus' check (kind in ('focus','break','event')),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint time_blocks_valid_range check (end_at > start_at)
);
alter table public.productive_sessions drop constraint if exists productive_sessions_planned_block_id_fkey;
alter table public.productive_sessions add constraint productive_sessions_planned_block_id_fkey foreign key (planned_block_id) references public.time_blocks(id) on delete set null;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  mood text not null default '',
  energy int check (energy between 1 and 5),
  highlights text not null default '',
  challenges text not null default '',
  gratitude text not null default '',
  tomorrow_priority text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint events_valid_range check (ends_at > starts_at)
);

create table if not exists public.monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, period_start)
);
alter table public.weekly_reviews add column if not exists period_start date;
update public.weekly_reviews set period_start = week_start where period_start is null;
alter table public.weekly_reviews alter column period_start set not null;

alter table public.focus_sessions add column if not exists ended_at timestamptz;
alter table public.focus_sessions add column if not exists category text not null default 'Work';
alter table public.focus_sessions add column if not exists goal_id uuid references public.goals(id) on delete set null;
alter table public.focus_sessions add column if not exists rating int check (rating between 1 and 5);
alter table public.focus_sessions add column if not exists notes text not null default '';
alter table public.focus_sessions add column if not exists state text not null default 'complete' check (state in ('running','paused','complete'));
alter table public.focus_sessions add column if not exists paused_seconds int not null default 0;
alter table public.focus_sessions add column if not exists planned_block_id uuid references public.time_blocks(id) on delete set null;
alter table public.productive_sessions add column if not exists elapsed_seconds int not null default 0;
alter table public.productive_sessions add column if not exists paused_at timestamptz;
alter table public.productive_sessions add column if not exists last_resumed_at timestamptz;

create index if not exists goals_user_cadence_idx on public.goals(user_id, cadence, deadline);
create index if not exists productive_sessions_user_started_idx on public.productive_sessions(user_id, started_at desc);
create index if not exists productive_sessions_goal_idx on public.productive_sessions(goal_id, started_at desc);
create index if not exists time_blocks_user_start_idx on public.time_blocks(user_id, start_at);
create index if not exists journal_entries_user_date_idx on public.journal_entries(user_id, entry_date desc);
create index if not exists events_user_start_idx on public.events(user_id, starts_at);
create index if not exists focus_sessions_user_category_idx on public.focus_sessions(user_id, category, started_at desc);

alter table public.goals enable row level security;
alter table public.productive_sessions enable row level security;
alter table public.time_blocks enable row level security;
alter table public.journal_entries enable row level security;
alter table public.events enable row level security;
alter table public.monthly_reviews enable row level security;

drop policy if exists "Users manage own goals" on public.goals;
create policy "Users manage own goals" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own productive sessions" on public.productive_sessions;
create policy "Users manage own productive sessions" on public.productive_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own time blocks" on public.time_blocks;
create policy "Users manage own time blocks" on public.time_blocks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own journal entries" on public.journal_entries;
create policy "Users manage own journal entries" on public.journal_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own events" on public.events;
create policy "Users manage own events" on public.events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own monthly reviews" on public.monthly_reviews;
create policy "Users manage own monthly reviews" on public.monthly_reviews for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.weekly_reviews enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['goals','productive_sessions','time_blocks','journal_entries','events','weekly_reviews','monthly_reviews'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
