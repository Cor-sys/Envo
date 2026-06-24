#!/bin/sh
# Apply the schema, then every migration in order, against the self-hosted db.
# Idempotent: schema.sql is written to be safe to re-run, and migrations use
# IF NOT EXISTS / guards. Re-running this service is harmless.
set -e

echo "[migrate] applying db/schema.sql ..."
psql -h db -U postgres -d postgres -v ON_ERROR_STOP=1 -f /db/schema.sql

echo "[migrate] applying migrations in order ..."
for f in $(ls /db/migrations/*.sql | sort); do
  echo "[migrate]   -> $f"
  psql -h db -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$f"
done

echo "[migrate] done."
