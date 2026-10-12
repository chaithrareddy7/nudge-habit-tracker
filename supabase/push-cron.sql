-- Nudge push notifications: run the scheduler every 5 minutes.
--
-- Run this ONCE in Supabase → SQL Editor, after:
--   1. Database → Extensions: enable `pg_cron` and `pg_net`
--   2. The `push` Edge Function is deployed and its secrets are set
-- Replace the two placeholders below:
--   <PROJECT_REF>  your project ref (e.g. jombigwxqzgslqryblai)
--   <PUSH_SECRET>  the same value you set as the PUSH_SECRET function secret
--
-- This file is not a migration on purpose: it contains your secret, so keep
-- the filled-in version out of git.

select cron.unschedule('nudge-push-tick') where exists (select 1 from cron.job where jobname = 'nudge-push-tick');

select cron.schedule(
  'nudge-push-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', '<PUSH_SECRET>'),
    body := jsonb_build_object('action', 'tick'),
    timeout_milliseconds := 25000
  );
  $$
);

-- Check it's scheduled:   select jobname, schedule, active from cron.job;
-- Recent runs:            select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
