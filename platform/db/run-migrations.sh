#!/usr/bin/env bash
set -euo pipefail

psql_cmd() {
  psql \
    -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    "$@"
}

echo "Waiting for database $POSTGRES_DB on $POSTGRES_HOST..."
for attempt in {1..60}; do
  if psql_cmd -tAc "select 1" >/dev/null 2>&1; then
    echo "Database is ready."
    break
  fi

  if [[ "$attempt" -eq 60 ]]; then
    echo "Database did not become ready in time." >&2
    exit 1
  fi

  sleep 1
done

psql_cmd -c "create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now());"

shopt -s nullglob
migration_count=0
for file in /migrations/*.sql; do
  ((migration_count += 1))
  id="$(basename "$file")"
  echo "Evaluating $id"

  psql_cmd <<SQL
select pg_advisory_lock(hashtext('schema_migrations_lock'));
select exists(select 1 from schema_migrations where id = '$id') as already_applied \gset
\if :already_applied
\echo Skipping $id
\else
\echo Running $id
\i $file
insert into schema_migrations (id) values ('$id');
\echo Applied $id
\endif
select pg_advisory_unlock(hashtext('schema_migrations_lock'));
SQL
done

if [[ "$migration_count" -eq 0 ]]; then
  echo "No migration files found in /migrations."
fi
