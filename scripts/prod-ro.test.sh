#!/usr/bin/env bash
# Tests for scripts/prod-ro.sh. Never touches production: every case points the
# wrapper at a throwaway env file. The live cases need a LOCAL Postgres and are
# skipped without one.
#
# Run: bash scripts/prod-ro.test.sh [local-postgres-admin-url]
#   default URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
set -u
WRAPPER="$(cd "$(dirname "$0")" && pwd)/prod-ro.sh"
ADMIN_URL="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
pass=0
fail=0

envfile() { printf 'PROD_READONLY_DB_URL=%s\n' "$1" > "$TMP/env"; }

# expect_refusal <description> <stderr substring> <wrapper args...> — exit 2
expect_refusal() {
  local name="$1" needle="$2"
  shift 2
  local err code
  err=$(PROD_RO_ENV_FILE="$TMP/env" bash "$WRAPPER" "$@" 2>&1 </dev/null)
  code=$?
  if [ "$code" = 2 ] && printf '%s' "$err" | grep -qi -- "$needle"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL %s: exit %s, output: %s\n' "$name" "$code" "$err"
  fi
}

# --- Refused before any connection -------------------------------------------
rm -f "$TMP/env"
expect_refusal "no env file" "no read-only credentials" -c "select 1"

envfile "postgresql://postgres:secret@127.0.0.1:1/postgres"
expect_refusal "superuser in URL" "only sms_readonly" -c "select 1"

envfile "postgresql://sms_readonly:x@127.0.0.1:1/postgres"
expect_refusal "backslash meta-command" "backslash" -c '\copy procurements.sms_students to out.csv'
expect_refusal "shell escape" "backslash" -c '\! ls'
expect_refusal "commit escapes the read-only transaction" "transaction control" -c "commit; select 1"
expect_refusal "set role" "transaction control" -c "set role postgres"
expect_refusal "unknown argument" "unknown argument" -c "select 1" --output out.txt
expect_refusal "empty SQL" "no SQL" -c "   "
expect_refusal "no SQL at all" "no SQL"

# Pooler usernames carry the project ref: sms_readonly.<ref> is accepted, so
# it gets as far as connecting (port 1: nothing listens) and fails with 1.
envfile "postgresql://sms_readonly.abcdefgh:x@127.0.0.1:1/postgres"
err=$(PROD_RO_ENV_FILE="$TMP/env" bash "$WRAPPER" -c "select 1" 2>&1 </dev/null)
code=$?
if [ "$code" = 1 ] && printf '%s' "$err" | grep -q "could not run"; then
  pass=$((pass + 1))
else
  fail=$((fail + 1))
  printf 'FAIL pooler username accepted: exit %s, output: %s\n' "$code" "$err"
fi

# --- Live, against a LOCAL Postgres -----------------------------------------
if psql "$ADMIN_URL" -X -Atqc "select 1" >/dev/null 2>&1; then
  psql "$ADMIN_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sms_readonly') THEN
    -- BYPASSRLS as in production: every procurements table has RLS on and no
    -- policy names this role, so without it every SELECT returns no rows.
    CREATE ROLE sms_readonly LOGIN PASSWORD 'local-test-only' BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA procurements TO sms_readonly;
GRANT SELECT ON procurements.sms_schools TO sms_readonly;
SQL
  host_part=${ADMIN_URL#*@}
  envfile "postgresql://sms_readonly:local-test-only@${host_part}"

  out=$(PROD_RO_ENV_FILE="$TMP/env" bash "$WRAPPER" --csv -c "select count(*) > 0 as ok from procurements.sms_schools" 2>&1)
  if [ "$out" = $'ok\nt' ]; then pass=$((pass + 1)); else fail=$((fail + 1)); printf 'FAIL live select: %s\n' "$out"; fi

  out=$(printf 'select 41 + 1 as answer;\n' | PROD_RO_ENV_FILE="$TMP/env" bash "$WRAPPER" --csv 2>&1)
  if [ "$out" = $'answer\n42' ]; then pass=$((pass + 1)); else fail=$((fail + 1)); printf 'FAIL live stdin: %s\n' "$out"; fi

  # A write fails even where the role were granted it: the transaction is read-only.
  psql "$ADMIN_URL" -X -q -c "GRANT UPDATE ON procurements.sms_schools TO sms_readonly"
  out=$(PROD_RO_ENV_FILE="$TMP/env" bash "$WRAPPER" -c "update procurements.sms_schools set name = name where false" 2>&1)
  code=$?
  if [ "$code" != 0 ] && printf '%s' "$out" | grep -qi "read-only transaction"; then pass=$((pass + 1)); else fail=$((fail + 1)); printf 'FAIL live write refused: exit %s %s\n' "$code" "$out"; fi

  psql "$ADMIN_URL" -X -q <<'SQL'
REVOKE ALL ON procurements.sms_schools FROM sms_readonly;
REVOKE USAGE ON SCHEMA procurements FROM sms_readonly;
DROP ROLE sms_readonly;
SQL
else
  printf 'skip: no local Postgres at the admin URL — live cases not run\n'
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
