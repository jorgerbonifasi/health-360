-- Health 360 — nightly scheduled jobs (pg_cron + pg_net)
--
-- Schedules reconcile (03:10 UTC) and compute-scores (03:20 UTC) daily. Each job POSTs to the
-- Edge Function via pg_net. Authentication uses a project JWT as the bearer — the anon key is
-- sufficient (it only needs to satisfy verify_jwt; the functions use the auto-injected
-- service_role internally). The anon key is public, so embedding it here is safe.
--
-- Replace <PROJECT_REF> and <ANON_KEY> before applying. Apply via the Supabase SQL Editor, or the
-- Management API (POST /v1/projects/<ref>/database/query), or `supabase db push`.
--
-- Alternative: schedule these two functions from the Supabase Dashboard (Edge Functions →
-- Schedules) instead, and skip this file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: drop existing jobs of the same name before (re)creating.
select cron.unschedule('health360-reconcile')
  where exists (select 1 from cron.job where jobname = 'health360-reconcile');
select cron.unschedule('health360-compute-scores')
  where exists (select 1 from cron.job where jobname = 'health360-compute-scores');

-- Reconcile last 7 days at 03:10 UTC (backfills any missed webhook).
select cron.schedule('health360-reconcile', '10 3 * * *', $cmd$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer <ANON_KEY>'),
    body    := '{"source":"cron"}'::jsonb
  );
$cmd$);

-- Recompute daily scores at 03:20 UTC (after reconcile).
select cron.schedule('health360-compute-scores', '20 3 * * *', $cmd$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/compute-scores',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer <ANON_KEY>'),
    body    := '{"source":"cron"}'::jsonb
  );
$cmd$);

-- Verify:  select jobname, schedule, active from cron.job order by jobname;
