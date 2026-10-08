-- Defense in depth: foreign keys prevent missing references, these triggers
-- also prevent linking one user's private goal to another user's records.
create or replace function public.validate_productivity_goal_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  goal_owner uuid;
begin
  if new.goal_id is not null then
    select g.user_id into goal_owner
    from public.goals as g
    where g.id = new.goal_id;

    if goal_owner is distinct from new.user_id then
      raise exception 'Goal must belong to the same user as the productivity record';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_productive_session_goal on public.productive_sessions;
create trigger validate_productive_session_goal
before insert or update of goal_id, user_id on public.productive_sessions
for each row execute function public.validate_productivity_goal_owner();

drop trigger if exists validate_time_block_goal on public.time_blocks;
create trigger validate_time_block_goal
before insert or update of goal_id, user_id on public.time_blocks
for each row execute function public.validate_productivity_goal_owner();

drop trigger if exists validate_task_goal on public.tasks;
create trigger validate_task_goal
before insert or update of goal_id, user_id on public.tasks
for each row execute function public.validate_productivity_goal_owner();
