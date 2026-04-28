#!/bin/sh
# API container entrypoint. Runs drizzle-kit push to reconcile schema
# then execs the Hono server. Replaces the old standalone db-migrate
# service — keeps the docker-compose flatter (one less container) and
# ensures schema is up-to-date before the API accepts traffic.
#
# The migration is idempotent: drizzle-kit push compares the schema to
# the DB and only applies diffs. On redeploys where nothing changed
# this is a sub-second no-op.
set -e

cd /app

echo "[entrypoint] pushing database schema…"
DATABASE_URL="postgresql://${DB_USER:-postgres}:${DB_PASSWORD}@postgres:5432/${DB_NAME:-ninelytics}" \
  bunx drizzle-kit push --force

echo "[entrypoint] setting up TimescaleDB…"
export PGPASSWORD="$DB_PASSWORD"
PG="psql -h postgres -U ${DB_USER:-postgres} -d ${DB_NAME:-ninelytics}"

$PG -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;" >/dev/null 2>&1 || true

HYPER_COUNT=$($PG -tAc "SELECT count(*) FROM timescaledb_information.hypertables" 2>/dev/null || echo "0")
if [ "$HYPER_COUNT" -gt "0" ] 2>/dev/null; then
  echo "[entrypoint] timescale: $HYPER_COUNT hypertables already configured"
else
  echo "[entrypoint] timescale: creating hypertables (first-time setup)"
  for tbl_col in "page_views:timestamp" "events:timestamp" "uptime_checks:checked_at" "web_vitals:recorded_at"; do
    tbl="${tbl_col%%:*}"
    col="${tbl_col##*:}"
    pk=$($PG -tAc "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='$tbl' AND constraint_type='PRIMARY KEY'" 2>/dev/null | tr -d ' ')
    if [ -n "$pk" ]; then
      $PG -c "ALTER TABLE $tbl DROP CONSTRAINT IF EXISTS $pk;" >/dev/null 2>&1 || true
      $PG -c "ALTER TABLE $tbl ADD PRIMARY KEY (id, $col);" >/dev/null 2>&1 || true
    fi
    $PG -c "SELECT create_hypertable('$tbl','$col',if_not_exists=>TRUE,migrate_data=>TRUE);" >/dev/null 2>&1 || true
  done
fi

# Backfill website_daily_stats for any (website, day) pairs not yet
# captured by the worker's flusher. Idempotent: ON CONFLICT DO NOTHING
# leaves rows alone once they've been touched. Bounded to the last 90
# days so startup stays quick; older history can be backfilled manually
# with the same query if a dashboard ever needs it.
echo "[entrypoint] backfilling website_daily_stats (last 90 days)…"
$PG -c "
  INSERT INTO website_daily_stats (website_id, day, page_views, updated_at)
  SELECT
    website_id,
    (timestamp AT TIME ZONE 'UTC')::date AS day,
    COUNT(*)::bigint AS page_views,
    NOW()
  FROM page_views
  WHERE timestamp >= NOW() - INTERVAL '90 days'
  GROUP BY website_id, (timestamp AT TIME ZONE 'UTC')::date
  ON CONFLICT (website_id, day) DO NOTHING;
" >/dev/null 2>&1 || echo "[entrypoint] backfill skipped (table not ready yet)"

echo "[entrypoint] starting api…"
cd /app/apps/api
exec bun run src/index.ts
