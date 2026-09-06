#!/usr/bin/env bash
# PreToolUse(Bash) guard for psql — see CLAUDE.md RULE 0.
#   hosted Supabase / .env.local  -> deny
#   explicit 127.0.0.1|localhost  -> allow (no prompt)
#   anything else                 -> ask (the old behaviour)
# Commands with no "psql" in them fall straight through untouched.

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

case "$cmd" in
  *psql*) ;;
  *) exit 0 ;;
esac

decide() {
  jq -nc --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

if printf '%s' "$cmd" | grep -Eqi 'supabase\.(co|com|net)|\.env\.local'; then
  decide deny "psql must never reach production. Use postgresql://postgres:postgres@127.0.0.1:54322/postgres (CLAUDE.md RULE 0)."
fi

if printf '%s' "$cmd" | grep -Eq '127\.0\.0\.1|localhost'; then
  decide allow "psql against the local Supabase clone."
fi

decide ask "psql with no explicit local host — confirm it cannot reach production."
