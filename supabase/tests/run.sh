#!/usr/bin/env bash
# Loads schema.sql into a scratch Postgres database (with stubs for the
# Supabase-provided auth/storage pieces) and runs the SQL tests against it.
# Uses the standard PG* environment variables (PGHOST, PGPORT, PGUSER, ...).
set -euo pipefail
cd "$(dirname "$0")"
DB="${TEST_DB:-yardsale_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f stubs.sql
"${PSQL[@]}" -d "$DB" -f ../schema.sql >/dev/null
# schema.sql must be safe to re-run on an existing database.
"${PSQL[@]}" -d "$DB" -f ../schema.sql >/dev/null
for t in *.test.sql; do
  "${PSQL[@]}" -d "$DB" -o /dev/null -f "$t"
done
