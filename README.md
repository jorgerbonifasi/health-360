# Health 360 — Personal Health Dashboard

Aggregates **weight** (Withings), **exercise** (Strava), and **steps** (Apple Health) into one
Supabase Postgres database, computes a daily **Health 360 Score** (0–100), and shows it all in a
mobile-friendly React dashboard.

Ingestion is webhook-driven, with a nightly reconciliation job that backfills the last 7 days in
case any webhook was missed. Everything is idempotent — replaying a webhook never creates
duplicates.

```
Withings scale ──notify──▶ withings-webhook ─┐
Strava activity ─webhook─▶ strava-webhook ───┤
Health Auto Export ─POST─▶ apple-health ─────┼──▶ Supabase Postgres ──▶ React dashboard (anon read)
                                             │            ▲
nightly cron ─▶ reconcile ──────────────────┘            │
nightly cron ─▶ compute-scores ──────────────────────────┘
```

## Architecture & security

- **Database:** Supabase Postgres. Schema, RLS, and views in `supabase/migrations/`.
- **Ingestion:** Supabase Edge Functions (Deno/TypeScript) in `supabase/functions/`.
- **Frontend:** React + Vite + Tailwind + Recharts in `web/`.
- **Security model:** the browser uses the **anon** key, which RLS restricts to `SELECT` on the
  data tables only. `oauth_tokens` (refresh tokens) has **no** anon policy — only the service
  role can read it. All writes happen inside Edge Functions using the **service role** key,
  which never reaches the browser. No login UI.

## Repo layout

```
supabase/
  config.toml                 # verify_jwt=false for the public webhook/oauth functions
  migrations/0001_init.sql     # tables, indexes, unique constraints, RLS, seed goals, views
  migrations/0002_cron.sql     # pg_cron schedules for reconcile + compute-scores
  functions/_shared/           # supabase client, token refresh, cors, activity normalizer, api helpers
  functions/oauth-callback/    # one-time OAuth callback (Strava + Withings); auto-subscribes Withings
  functions/strava-webhook/    # GET validation + POST event → fetch activity → upsert
  functions/withings-webhook/  # POST notify → getmeas → upsert weight
  functions/apple-health/      # POST Health Auto Export JSON → upsert daily_steps (token-gated)
  functions/reconcile/         # cron: backfill last 7 days from Strava + Withings
  functions/compute-scores/    # cron: compute + store daily_scores
web/                          # React dashboard (see web/.env.example)
.env.example                  # backend/Edge Function secrets
```

## Prerequisites

- A [Supabase](https://supabase.com) project (free tier is fine).
- [Supabase CLI](https://supabase.com/docs/guides/cli): `brew install supabase/tap/supabase`.
- Node 18+ for the dashboard.
- A publicly reachable functions URL — your Supabase project already provides
  `https://<PROJECT_REF>.supabase.co/functions/v1/<name>`.

Throughout, replace `<PROJECT_REF>` with your project ref (the subdomain of your Supabase URL).

---

## 1. Apply the database schema

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push        # applies supabase/migrations/*.sql
```

This creates all tables, indexes, RLS policies, the two dashboard views, and seeds the `goals`
table with default targets and scoring weights (edit those rows anytime — see
[Tuning](#tuning-goals--score-weights)).

> Skip `0002_cron.sql` for now if you'd rather schedule the crons from the Dashboard — see
> [step 7](#7-schedule-the-nightly-jobs).

## 2. Set the Edge Function secrets

Copy `.env.example` to `.env` and fill it in, then push the values as function secrets:

```bash
cp .env.example .env
# edit .env ...
supabase secrets set --env-file .env
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` come from **Project Settings → API**. The Strava
and Withings values come from steps 4 and 5 below (you can set them now if you already created
the apps, or re-run `supabase secrets set` later).

## 3. Deploy the Edge Functions

```bash
supabase functions deploy oauth-callback strava-webhook withings-webhook apple-health reconcile compute-scores
```

`config.toml` already disables JWT verification for the four public functions (webhooks + OAuth
callback); they enforce their own auth. `reconcile` and `compute-scores` keep JWT on and are
only called by the cron job with the service-role bearer.

## 4. Connect Strava

1. Create an API application at <https://www.strava.com/settings/api>.
   - **Authorization Callback Domain:** `<PROJECT_REF>.supabase.co` (domain only, no path).
   - Copy the **Client ID** and **Client Secret** into `.env`
     (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`), pick any random `STRAVA_VERIFY_TOKEN`, and
     re-run `supabase secrets set --env-file .env`.
2. **Authorize once** — open this URL in a browser and approve:
   ```
   https://www.strava.com/oauth/authorize?client_id=<STRAVA_CLIENT_ID>&response_type=code&redirect_uri=https://<PROJECT_REF>.supabase.co/functions/v1/oauth-callback?provider=strava&approval_prompt=force&scope=read,activity:read_all
   ```
   You should land on “✅ strava connected”.
3. **Register the webhook subscription** (once):
   ```bash
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id=<STRAVA_CLIENT_ID> \
     -F client_secret=<STRAVA_CLIENT_SECRET> \
     -F callback_url=https://<PROJECT_REF>.supabase.co/functions/v1/strava-webhook \
     -F verify_token=<STRAVA_VERIFY_TOKEN>
   ```
   Strava immediately calls the `strava-webhook` GET handler to validate the token, then returns
   a subscription `id`. New/updated activities will now be pushed automatically.

## 5. Connect Withings

1. Create an application at <https://developer.withings.com> (Public Cloud / “Withings API”).
   - **Callback URI:** `https://<PROJECT_REF>.supabase.co/functions/v1/oauth-callback?provider=withings`
   - Copy the **Client ID** and **Client Secret** into `.env`
     (`WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET`) and re-run `supabase secrets set --env-file .env`.
2. **Authorize once** — open this URL and approve:
   ```
   https://account.withings.com/oauth2_user/authorize2?response_type=code&client_id=<WITHINGS_CLIENT_ID>&scope=user.metrics&redirect_uri=https://<PROJECT_REF>.supabase.co/functions/v1/oauth-callback?provider=withings&state=setup
   ```
   On success the callback **auto-registers the weight notification subscription** for you — the
   page will say “subscribed”. (If it reports it couldn't subscribe, your callback wasn't publicly
   reachable yet; re-open the authorize URL after the function is deployed.)

Now stepping on the scale triggers `withings-webhook`, which fetches the new measurement and
stores it.

## 6. Configure Apple Health (Health Auto Export)

In the **Health Auto Export** iOS app:

1. Add an **Automation** → **REST API** export.
2. **URL:** `https://<PROJECT_REF>.supabase.co/functions/v1/apple-health?token=<APPLE_HEALTH_TOKEN>`
   (use the same `APPLE_HEALTH_TOKEN` you set in `.env`). Alternatively send it as an `X-Token`
   header.
3. **Data type:** Steps. **Aggregation:** Daily. **Format:** JSON.
4. **Schedule:** e.g. once daily. Each POST upserts `daily_steps` (idempotent per day).

## 7. Schedule the nightly jobs

**Option A — SQL (pg_cron), via `0002_cron.sql`:** replace `<PROJECT_REF>` and `<ANON_KEY>` in the
file, then run it (SQL Editor, `supabase db push`, or the Management API). It enables `pg_cron` +
`pg_net` and schedules `reconcile` at 03:10 UTC and `compute-scores` at 03:20 UTC daily. The jobs
POST to the functions with the public anon key as bearer (enough to pass `verify_jwt`; the
functions use the auto-injected service role internally). Verify with:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

**Option B — Dashboard:** Edge Functions → each function → **Schedules**, add a cron expression
(`10 3 * * *` and `20 3 * * *`).

You can also run either function on demand:

```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/reconcile \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/compute-scores \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## 8. Run the dashboard

```bash
cd web
cp .env.example .env.local          # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev                          # http://localhost:5173
```

The anon URL + key are in **Project Settings → API**. Build for deployment with `npm run build`
(outputs `web/dist`, deployable to any static host).

**Demo mode:** to preview the dashboard with realistic fake data and no backend, set
`VITE_USE_MOCK=1` in `web/.env.local` and run `npm run dev`.

---

## The Health 360 Score

A daily 0–100 score combining three weighted pillars (computed by `compute-scores`, stored in
`daily_scores`):

| Pillar | Weight | How it's scored |
| --- | --- | --- |
| **Movement** | 40% | `min(steps / daily_step_goal, 1.2) × 100` |
| **Exercise** | 40% | `min(rolling-7d active hours / weekly_active_hours_goal, 1.2) × 100` |
| **Weight trend** | 20% | 7-day rolling avg vs goal direction: toward → 100, flat (±0.1 kg/wk) → 70, away → 40 |

`total = movement×0.4 + exercise×0.4 + weight×0.2`

**Missing data is never punished as zero.** A pillar with no data is dropped and the remaining
weights are renormalized. Movement is "missing" when there's no steps row for the day; weight is
"missing" when there was no weigh-in in the trailing 7 days. Exercise is always present (0 hours
over the week is a genuine signal, not a gap). The 120% cap lets a huge day give a small bonus
without masking a bad week.

## Tuning goals & score weights

Everything tunable lives in the `goals` table — no code changes or redeploys needed. Edit via the
Supabase Table Editor or SQL:

```sql
update goals set target_value = 72   where metric = 'target_weight';
update goals set target_value = 12000 where metric = 'daily_step_goal';
update goals set target_value = 6    where metric = 'weekly_active_hours_goal';
update goals set target_value = 0.5  where metric = 'pillar_weight_weight';  -- reweight pillars
```

Seeded metrics: `target_weight` (+`direction`), `daily_step_goal`, `weekly_active_hours_goal`,
`weekly_running_km_goal`, `pillar_weight_movement`, `pillar_weight_exercise`,
`pillar_weight_weight`, `score_cap_ratio`.

## Activity type handling

Strava's raw type is stored verbatim in `activities.type`; `activities.type_group` is the
normalized display group: **Run**, **Ride**, **Hike/Walk**, **Racket sports**, **Other**. Tennis
is logged by Strava as either `Workout` or `TennisSport` depending on how it's recorded — both map
to Racket sports (see `functions/_shared/normalizeActivity.ts`). Distance/pace apply to
Run/Ride/Hike only; duration and HR are the universal metrics.

## Local development & testing

```bash
supabase start                       # local Postgres + functions runtime
supabase db reset                    # apply migrations to the local DB
supabase functions serve             # serve functions locally with .env
```

Quick idempotency check (run any sample webhook POST twice → exactly one row):

```bash
# Strava GET handshake echo:
curl "http://localhost:54321/functions/v1/strava-webhook?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=<STRAVA_VERIFY_TOKEN>"

# Apple Health sample:
curl -X POST "http://localhost:54321/functions/v1/apple-health?token=<APPLE_HEALTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"data":{"metrics":[{"name":"step_count","units":"count","data":[{"date":"2026-07-11 00:00:00 +0000","qty":8452}]}]}}'
```

## Troubleshooting

- **Dashboard shows “Couldn't load data”** → check `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  in `web/.env.local`, and that migrations + RLS policies are applied.
- **Strava/Withings fetch fails with “No … tokens found”** → complete the one-time OAuth
  authorize step (4.2 / 5.2).
- **Webhook not firing** → the nightly `reconcile` will still backfill the last 7 days, so data
  isn't lost; re-check the subscription registration.
- **Withings didn't auto-subscribe** → ensure `withings-webhook` is deployed and publicly
  reachable, then re-open the authorize URL.
