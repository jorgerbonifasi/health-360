-- Health 360 - nightly coach review + source watchdog (pg_cron + pg_net)
--
-- 04:00 UTC  run-review    grades the most recent unreviewed coach plan (after reconcile at 03:10
--                          has pulled in the day's Strava activity), so the feedback is simply there
--                          each morning instead of waiting for a button press.
-- 04:10 UTC  check-sources pushes a phone notification (ntfy) if a data source has gone quiet or the
--                          Strava API app is rejecting calls.
--
-- Replace <PROJECT_REF> and <ANON_KEY> before applying (same as 0002_cron.sql; the anon key is
-- public). Apply in the Supabase SQL editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('health360-run-review')
  where exists (select 1 from cron.job where jobname = 'health360-run-review');
select cron.unschedule('health360-check-sources')
  where exists (select 1 from cron.job where jobname = 'health360-check-sources');

select cron.schedule('health360-run-review', '0 4 * * *', $cmd$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-review',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer <ANON_KEY>'),
    body    := '{"source":"cron"}'::jsonb
  );
$cmd$);

select cron.schedule('health360-check-sources', '10 4 * * *', $cmd$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/check-sources',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer <ANON_KEY>'),
    body    := '{"source":"cron"}'::jsonb
  );
$cmd$);

-- Verify:  select jobname, schedule, active from cron.job order by jobname;
