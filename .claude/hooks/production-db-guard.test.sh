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

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
