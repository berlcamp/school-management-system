#!/usr/bin/env bash
# Read-only access to the PRODUCTION database, for debugging (CLAUDE.md RULE 0).
#
#   scripts/prod-ro.sh [--csv] -c "SELECT ..."
#   scripts/prod-ro.sh [--csv] <<'SQL'
#   SELECT ...;
#   SQL
#
# This is the ONLY sanctioned way for an agent or a script to read production.
# Changes to data or structure are never made here — they go out as a new file
# in supabase/migrations/ that the project owner applies by hand.
#
# Layers, outermost first (the role is the one that actually holds):
#   1. the guard hook (.claude/hooks/production-db-guard.sh) only lets this
#      script run on its own line, piped at most into a text filter, so its
#      output is never written to a file or sent anywhere;
#   2. the credentials live in .env.prod-readonly (git-ignored, read here and
#      nowhere else) and must name the sms_readonly role — anything else is
#      refused before connecting;
#   3. psql backslash commands are refused (\copy, \o, \w write files; \! runs
#      a shell), and so is transaction control (COMMIT, SET ROLE, …) that could
#      leave the read-only transaction below;
#   4. every call runs inside BEGIN READ ONLY with a 30 s statement timeout, and
#      first checks on the server that it is connected as sms_readonly;
#   5. the sms_readonly role itself holds SELECT only.
#
# PROD_RO_ENV_FILE overrides the credentials file — for scripts/prod-ro.test.sh,
# which points it at a local Postgres. The role check still applies.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${PROD_RO_ENV_FILE:-$ROOT/.env.prod-readonly}"

die() {
  printf 'prod-ro: %s\n' "$*" >&2
  exit 2
}

usage='usage: scripts/prod-ro.sh [--csv] -c "SQL"   or   scripts/prod-ro.sh [--csv] < SQL on stdin'

csv=0
sql=""
have_c=0
while [ $# -gt 0 ]; do
  case "$1" in
    --csv) csv=1 ;;
    -c)
      shift
      [ $# -gt 0 ] || die "-c needs SQL. $usage"
      sql="$1"
      have_c=1
      ;;
    *) die "unknown argument '$1'. $usage" ;;
  esac
  shift
done

if [ "$have_c" = 0 ] && [ ! -t 0 ]; then
  sql=$(cat)
fi
if [ -z "${sql//[[:space:]]/}" ]; then
  die "no SQL given. $usage"
fi

# 3. No meta-commands. (A backslash inside a SQL string literal is refused too;
#    use chr(92) if you ever genuinely need one.)
if printf '%s' "$sql" | grep -q '\\'; then
  die "psql backslash commands are not allowed (\\copy, \\o and \\w write files, \\! runs a shell)."
fi
if printf '%s' "$sql" | grep -Eiq '(^|[^a-z_])(commit|rollback|abort|savepoint|release|start[[:space:]]+transaction|set[[:space:]]+(session|role|transaction|default_transaction)|reset|discard)([^a-z_]|$)'; then
  die "transaction control and role changes are not allowed — every call is one read-only transaction."
fi

# 2. Credentials.
[ -f "$ENV_FILE" ] || die "no read-only credentials ($ENV_FILE). Ask the project owner; never use .env.local."
url=$(grep -E '^PROD_READONLY_DB_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']$//")
[ -n "$url" ] || die "PROD_READONLY_DB_URL is not set in the credentials file."
user=$(printf '%s' "$url" | sed -E 's#^postgres(ql)?://##; s#@.*$##; s#:.*$##')
case "$user" in
  sms_readonly | sms_readonly.*) ;; # the pooler spells it sms_readonly.<project-ref>
  *) die "only sms_readonly may connect through this script (the URL names '$user')." ;;
esac

# 4. One read-only transaction; the role is confirmed on the server first.
fmt=(-X -q -v ON_ERROR_STOP=1 -P pager=off)
[ "$csv" = 1 ] && fmt+=(--csv)

export PGAPPNAME="sms-prod-ro"
export PGCONNECT_TIMEOUT=10

if ! {
  printf '%s\n' \
    "BEGIN READ ONLY;" \
    "SET LOCAL statement_timeout = '30s';" \
    "DO \$guard\$ BEGIN IF current_user <> 'sms_readonly' THEN RAISE EXCEPTION 'prod-ro: connected as %, expected sms_readonly', current_user; END IF; END \$guard\$;"
  printf '%s\n;\n' "$sql"
  printf '%s\n' "ROLLBACK;"
} | psql "$url" "${fmt[@]}"; then
  printf 'prod-ro: could not run the query (see the error above).\n' >&2
  exit 1
fi
