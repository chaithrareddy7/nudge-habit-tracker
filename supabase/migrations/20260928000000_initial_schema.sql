-- Nudge initial schema. Run with Supabase CLI or paste into the SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text default 'Asia/Kolkata',
  created_at timestamptz default now()
);
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text default '🌱',
  color text default '#94b99e',
  frequency_type text not null default 'daily' check (frequency_type in ('daily','weekdays','times_per_week')),
  weekdays int[],
  times_per_week int check (times_per_week between 1 and 7),
  reminder_time time,
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  first_step text,
  due_date date,
  priority int not null default 0,
  estimated_minutes int,
  is_top_priority boolean not null default false,
  is_two_minute boolean not null default false,
  snooze_count int not null default 0,
  status text not null default 'todo' check (status in ('inbox','todo','done','archived')),
  parent_id uuid references public.tasks(id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  started_at timestamptz not null default now(),
  duration_minutes int not null check (duration_minutes > 0)
);
create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists habits_user_id_idx on public.habits(user_id);
create index if not exists habit_logs_user_date_idx on public.habit_logs(user_id, log_date);
create index if not exists habit_logs_habit_date_idx on public.habit_logs(habit_id, log_date);
create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_user_status_idx on public.tasks(user_id, status);
create index if not exists focus_sessions_user_started_idx on public.focus_sessions(user_id, started_at);
create index if not exists weekly_reviews_user_week_idx on public.weekly_reviews(user_id, week_start);

alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.tasks enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.weekly_reviews enable row level security;

drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "Users manage own habits" on public.habits;
create policy "Users manage own habits" on public.habits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own habit logs" on public.habit_logs;
create policy "Users manage own habit logs" on public.habit_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own tasks" on public.tasks;
create policy "Users manage own tasks" on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own focus sessions" on public.focus_sessions;
create policy "Users manage own focus sessions" on public.focus_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own weekly reviews" on public.weekly_reviews;
create policy "Users manage own weekly reviews" on public.weekly_reviews for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
