#!/bin/sh
set -eu

if [ -z "${POSTGRES_HOST:-}" ] || [ -z "${POSTGRES_DB:-}" ] || [ -z "${POSTGRES_USER:-}" ]; then
	echo "POSTGRES_HOST, POSTGRES_DB, and POSTGRES_USER are required" >&2
	exit 1
fi

for migration in /migrations/*.sql; do
	if [ ! -f "$migration" ]; then
		echo "No migration files found in /migrations" >&2
		exit 1
	fi

	echo "Applying migration: $migration"
	psql \
		"host=${POSTGRES_HOST} dbname=${POSTGRES_DB} user=${POSTGRES_USER}" \
		-v ON_ERROR_STOP=1 \
		-f "$migration"
done
