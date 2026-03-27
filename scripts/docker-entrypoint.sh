#!/bin/sh
set -e

echo "── Pushing database schema..."
DATABASE_URL="postgresql://${DB_USER:-postgres}:${DB_PASSWORD}@postgres:5432/${DB_NAME:-ninelytics}" npx drizzle-kit push --force

echo "── Setting up TimescaleDB..."
export PGPASSWORD="$DB_PASSWORD"
PG="psql -h postgres -U ${DB_USER:-postgres} -d ${DB_NAME:-ninelytics}"

$PG -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;" || true

# Check if hypertables already exist (skip everything if so — fast path for redeploys)
HYPER_COUNT=$($PG -tAc "SELECT count(*) FROM timescaledb_information.hypertables" 2>/dev/null || echo "0")
if [ "$HYPER_COUNT" -gt "0" ] 2>/dev/null; then
  echo "  TimescaleDB already configured ($HYPER_COUNT hypertables), skipping"
else
  echo "  Creating hypertables (first-time setup)..."
  # TimescaleDB needs the partitioning column in the PK.
  # Swap PK from (id) to (id, time_col), then create hypertable.
  for tbl_col in "page_views:timestamp" "events:timestamp" "uptime_checks:checked_at" "web_vitals:recorded_at"; do
    tbl="${tbl_col%%:*}"
    col="${tbl_col##*:}"
    echo "  → $tbl ($col)"
    pk=$($PG -tAc "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='$tbl' AND constraint_type='PRIMARY KEY'" 2>/dev/null | tr -d ' ')
    if [ -n "$pk" ]; then
      $PG -c "ALTER TABLE $tbl DROP CONSTRAINT IF EXISTS $pk;" || true
      $PG -c "ALTER TABLE $tbl ADD PRIMARY KEY (id, $col);" || true
    fi
    $PG -c "SELECT create_hypertable('$tbl','$col',if_not_exists=>TRUE,migrate_data=>TRUE);" || true
  done
fi

echo "── Starting Ninelytics..."
exec node server.js
