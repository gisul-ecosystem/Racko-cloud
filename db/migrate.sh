#!/usr/bin/env bash
# Applies pending SQL from /migrations then /seeds (sorted by filename).
# Safe for an already-restored DB: first run baselines existing files without re-running them.
set -euo pipefail

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-racko}"
PGDATABASE="${PGDATABASE:-racko}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
SEEDS_DIR="${SEEDS_DIR:-/seeds}"

echo "Waiting for Postgres at ${PGHOST}:${PGPORT}..."
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; do
  sleep 1
done
echo "Postgres is ready."

psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schema_seeds (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

has_app_schema="$(psql -tAc "SELECT CASE WHEN to_regclass('public.requests') IS NULL THEN 0 ELSE 1 END" | tr -d '[:space:]')"

apply_dir() {
  local dir="$1"
  local table="$2"
  local label="$3"

  if [ ! -d "$dir" ]; then
    echo "No ${label} directory at ${dir} — skipping."
    return 0
  fi

  local file_count
  file_count="$(find "$dir" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
  if [ "$file_count" = "0" ]; then
    echo "No ${label} files found in ${dir}"
    return 0
  fi

  local applied_count
  applied_count="$(psql -tAc "SELECT COUNT(*) FROM public.${table}" | tr -d '[:space:]')"

  # Already-restored DB: record current files as applied once (do not re-run).
  if [ "$applied_count" = "0" ] && [ "$has_app_schema" = "1" ]; then
    echo "Detected existing app schema with empty ${table} — baselining current ${label}..."
    for f in $(find "$dir" -maxdepth 1 -type f -name '*.sql' | sort); do
      local name
      name="$(basename "$f")"
      psql -v ON_ERROR_STOP=1 -c "INSERT INTO public.${table} (filename) VALUES ('${name}') ON CONFLICT DO NOTHING;"
      echo "  baselined ${name}"
    done
    echo "Baseline complete for ${label}."
    return 0
  fi

  echo "Applying pending ${label}..."
  local applied=0
  local skipped=0
  for f in $(find "$dir" -maxdepth 1 -type f -name '*.sql' | sort); do
    local name
    name="$(basename "$f")"
    local exists
    exists="$(psql -tAc "SELECT 1 FROM public.${table} WHERE filename = '${name}'" | tr -d '[:space:]')"
    if [ "$exists" = "1" ]; then
      skipped=$((skipped + 1))
      continue
    fi
    echo "  applying ${name}"
    psql -v ON_ERROR_STOP=1 -f "$f"
    psql -v ON_ERROR_STOP=1 -c "INSERT INTO public.${table} (filename) VALUES ('${name}');"
    applied=$((applied + 1))
  done
  echo "Done ${label}. applied=${applied} skipped=${skipped}"
}

apply_dir "$MIGRATIONS_DIR" "schema_migrations" "migrations"
apply_dir "$SEEDS_DIR" "schema_seeds" "seeds"
