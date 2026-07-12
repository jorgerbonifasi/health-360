-- Health 360 — initial schema
-- Single-user personal health dashboard.
-- Security model: anon (and authenticated) get SELECT-only on data tables via RLS.
-- All writes happen through Edge Functions using the service_role key, which bypasses RLS.
-- oauth_tokens is intentionally left with NO anon policy (it holds refresh tokens), so it is
-- reachable only by the service_role key.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Weight measurements (Withings). Idempotent on (source, external_id) where external_id is
-- the Withings measure-group id ("grpid").
create table if not exists public.weight_logs (
  id          bigint generated always as identity primary key,
  measured_at timestamptz not null,
  weight_kg   numeric     not null,
  fat_ratio   numeric,
  source      text        not null default 'withings',
  external_id text        not null,
  raw         jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (source, external_id)
);

-- Daily step counts (Apple Health via Health Auto Export). One row per source per day.
create table if not exists public.daily_steps (
  id         bigint generated always as identity primary key,
  date       date        not null,
  steps      integer     not null,
  source     text        not null default 'apple_health',
  raw        jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, date)
);

-- Exercise activities (Strava). Idempotent on strava_id.
-- type       = Strava's raw activity type, stored verbatim.
-- type_group = normalized display group (Run / Ride / Hike/Walk / Racket sports / Other).
create table if not exists public.activities (
  id            bigint generated always as identity primary key,
  strava_id     bigint      not null,
  source        text        not null default 'strava',
  type          text        not null,
  type_group    text        not null,
  name          text,
  started_at    timestamptz not null,
  distance_m    numeric     not null default 0,
  moving_time_s integer     not null default 0,
  elapsed_time_s integer    not null default 0,
  avg_hr        numeric,
  max_hr        numeric,
  elevation_m   numeric,
  raw           jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (strava_id)
);

-- Tunable configuration: goals AND scoring pillar weights / cap, so they can be changed
-- without touching code.
--   direction: 'down' | 'up'  (for target_weight; the direction we want the metric to move)
--   period:    'day' | 'week' (informational)
create table if not exists public.goals (
  id           bigint generated always as identity primary key,
  metric       text        not null unique,
  target_value numeric     not null,
  direction    text,
  period       text,
  active       boolean     not null default true,
  updated_at   timestamptz not null default now()
);

-- Computed daily Health 360 score. Pillar sub-scores are null when that pillar had no data
-- (the pillar is dropped and remaining weights are renormalized — never scored as zero).
create table if not exists public.daily_scores (
  id             bigint generated always as identity primary key,
  date           date        not null unique,
  total          numeric     not null,
  movement_score numeric,
  exercise_score numeric,
  weight_score   numeric,
  details        jsonb       not null default '{}'::jsonb,
  computed_at    timestamptz not null default now()
);

-- OAuth tokens per provider ('strava' | 'withings'). One row each; refreshed in place.
-- SECRET TABLE — no RLS policy is created, so anon/authenticated cannot read it.
create table if not exists public.oauth_tokens (
  provider      text        primary key,
  access_token  text        not null,
  refresh_token text        not null,
  expires_at    timestamptz not null,
  scope         text,
  raw           jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (unique constraints above already create their own indexes)
-- ---------------------------------------------------------------------------
create index if not exists idx_activities_started_at   on public.activities (started_at);
create index if not exists idx_activities_group_started on public.activities (type_group, started_at);
create index if not exists idx_weight_logs_measured_at  on public.weight_logs (measured_at);
create index if not exists idx_daily_steps_date         on public.daily_steps (date);
create index if not exists idx_daily_scores_date        on public.daily_scores (date);

-- ---------------------------------------------------------------------------
-- Seed goals + scoring configuration (edit values freely; no redeploy needed)
-- ---------------------------------------------------------------------------
insert into public.goals (metric, target_value, direction, period) values
  ('target_weight',            75,    'down', 'day'),   -- kg; direction we want the trend to move
  ('daily_step_goal',          10000, null,   'day'),
  ('weekly_active_hours_goal', 5,     'up',   'week'),  -- hours across all sports
  ('weekly_running_km_goal',   40,    'up',   'week'),  -- half-marathon training target
  ('pillar_weight_movement',   0.4,   null,   null),
  ('pillar_weight_exercise',   0.4,   null,   null),
  ('pillar_weight_weight',     0.2,   null,   null),
  ('score_cap_ratio',          1.2,   null,   null)     -- max ratio before ×100 (120% bonus cap)
on conflict (metric) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Data tables: anon + authenticated may SELECT. No write policies (writes use service_role).
-- oauth_tokens: RLS on, no policy → only service_role can touch it.
-- ---------------------------------------------------------------------------
alter table public.weight_logs  enable row level security;
alter table public.daily_steps  enable row level security;
alter table public.activities   enable row level security;
alter table public.goals        enable row level security;
alter table public.daily_scores enable row level security;
alter table public.oauth_tokens enable row level security;

-- drop-then-create makes this migration safely re-runnable (create policy has no IF NOT EXISTS).
drop policy if exists "read weight_logs"  on public.weight_logs;
drop policy if exists "read daily_steps"  on public.daily_steps;
drop policy if exists "read activities"   on public.activities;
drop policy if exists "read goals"        on public.goals;
drop policy if exists "read daily_scores" on public.daily_scores;

create policy "read weight_logs"  on public.weight_logs  for select to anon, authenticated using (true);
create policy "read daily_steps"  on public.daily_steps  for select to anon, authenticated using (true);
create policy "read activities"   on public.activities   for select to anon, authenticated using (true);
create policy "read goals"        on public.goals        for select to anon, authenticated using (true);
create policy "read daily_scores" on public.daily_scores for select to anon, authenticated using (true);
-- (no policy on oauth_tokens by design)

-- ---------------------------------------------------------------------------
-- Views for the dashboard (keep weekly aggregation out of the client).
-- Week bucket = Monday (ISO week), returned as a date.
-- security_invoker so the anon caller's RLS still applies to underlying tables.
-- ---------------------------------------------------------------------------

-- Active hours per ISO week, split by normalized activity group.
create or replace view public.v_weekly_activity_hours
with (security_invoker = true) as
select
  (date_trunc('week', started_at))::date as week_start,
  type_group,
  sum(moving_time_s) / 3600.0            as hours,
  count(*)                               as activity_count
from public.activities
group by 1, 2;

-- Running-only weekly totals: km and average pace (min/km).
create or replace view public.v_weekly_running
with (security_invoker = true) as
select
  (date_trunc('week', started_at))::date as week_start,
  sum(distance_m) / 1000.0               as km,
  sum(moving_time_s)                     as moving_time_s,
  case
    when sum(distance_m) > 0
      then (sum(moving_time_s) / 60.0) / (sum(distance_m) / 1000.0)  -- minutes per km
    else null
  end                                    as avg_pace_min_km,
  count(*)                               as run_count
from public.activities
where type_group = 'Run'
group by 1;

-- ---------------------------------------------------------------------------
-- Explicit least-privilege grants for the Data API roles.
-- This makes the schema self-sufficient regardless of the project's "Automatically expose new
-- tables" setting: anon/authenticated get SELECT only on the data tables + views, and NO
-- privilege at all on oauth_tokens (defense in depth on top of its RLS "no policy" lockdown).
-- The service_role (used by Edge Functions) bypasses both grants and RLS.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on
  public.weight_logs,
  public.daily_steps,
  public.activities,
  public.goals,
  public.daily_scores,
  public.v_weekly_activity_hours,
  public.v_weekly_running
to anon, authenticated;

-- Ensure oauth_tokens is never reachable by the Data API roles, even if a project default
-- would otherwise expose it.
revoke all on public.oauth_tokens from anon, authenticated;

-- The service_role (used by every Edge Function) needs full DML on all tables, including
-- oauth_tokens. With "Automatically expose new tables" disabled, Supabase does NOT auto-grant
-- to service_role either, so we grant explicitly. (service_role also bypasses RLS.)
grant select, insert, update, delete on
  public.weight_logs,
  public.daily_steps,
  public.activities,
  public.goals,
  public.daily_scores,
  public.oauth_tokens
to service_role;
