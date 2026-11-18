#!/usr/bin/env bash
# Tests for supabase-mcp-guard.sh. Feeds MCP tool calls to the hook as Claude
# Code does and checks the decision. Run: bash .claude/hooks/supabase-mcp-guard.test.sh
set -u
HOOK="$(cd "$(dirname "$0")" && pwd)/supabase-mcp-guard.sh"
pass=0
fail=0

# decision_for <tool_name> [query] → allow | deny | none
decision_for() {
  local out
  out=$(jq -nc --arg t "$1" --arg q "${2:-}" \
    '{tool_name:$t, tool_input:(if $q == "" then {} else {query:$q} end)}' | bash "$HOOK")
  if [ -z "$out" ]; then echo none; return; fi
  printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "none"'
}

expect() {
  local want="$1" tool="$2" query="${3:-}" got
  got=$(decision_for "$tool" "$query")
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL: expected %s, got %s — %s %s\n' "$want" "$got" "$tool" "$query"
  fi
}

RO=mcp__supabase-prod-ro

# --- The project's read-only server: reads allowed -----------------------------
expect allow "${RO}__execute_sql" "select count(*) from procurements.sms_schools"
expect allow "${RO}__execute_sql" "SELECT pg_get_functiondef('procurements.students_gpa_for_grade(bigint[],integer,text,bigint)'::regprocedure)"
expect allow "${RO}__execute_sql" "with t as (select 1 as updated_at) select * from t"
expect allow "${RO}__execute_sql" "select * from procurements.sms_grades where grade > 0 -- delete from later? no"
expect allow "${RO}__execute_sql" "explain select 1"
expect allow "${RO}__list_tables"
expect allow "${RO}__list_migrations"
expect allow "${RO}__get_advisors"
expect allow "${RO}__get_logs"
expect allow "${RO}__search_docs"
expect allow "${RO}__generate_typescript_types"

# --- The project's read-only server: writes refused, whatever the server says --
expect deny "${RO}__apply_migration"
expect deny "${RO}__deploy_edge_function"
expect deny "${RO}__create_branch"
expect deny "${RO}__delete_branch"
expect deny "${RO}__merge_branch"
expect deny "${RO}__reset_branch"
expect deny "${RO}__pause_project"
expect deny "${RO}__update_storage_config"
expect deny "${RO}__get_publishable_keys"
expect deny "${RO}__some_tool_added_later"
expect deny "${RO}__execute_sql" "update procurements.sms_grades set grade = 90 where id = 1"
expect deny "${RO}__execute_sql" "DELETE FROM procurements.sms_attendance"
expect deny "${RO}__execute_sql" "insert into procurements.sms_schools(name) values ('x')"
expect deny "${RO}__execute_sql" "select 1; drop table procurements.sms_grades"
expect deny "${RO}__execute_sql" "with gone as (delete from procurements.sms_grades returning *) select count(*) from gone"
expect deny "${RO}__execute_sql" "alter table procurements.sms_grades add column x int"
expect deny "${RO}__execute_sql" "create table t (id int)"
expect deny "${RO}__execute_sql" "truncate procurements.sms_grades"
expect deny "${RO}__execute_sql" "grant all on procurements.sms_grades to anon"
expect deny "${RO}__execute_sql" "set role postgres"
expect deny "${RO}__execute_sql" "begin; update procurements.sms_grades set grade = 1; commit"
expect deny "${RO}__execute_sql" "do \$\$ begin perform 1; end \$\$"
expect deny "${RO}__execute_sql" "copy procurements.sms_students to '/tmp/x.csv'"
expect deny "${RO}__execute_sql" "select * into newtable from procurements.sms_students"

# --- The account-wide claude.ai connector: never, in this project -------------
expect deny "mcp__claude_ai_Supabase__execute_sql" "select 1"
expect deny "mcp__claude_ai_Supabase__list_projects"
expect deny "mcp__claude_ai_Supabase__apply_migration"
expect deny "mcp__claude_ai_Supabase__search_docs"

# --- Anything else is not this hook's business ----------------------------------
expect none "mcp__claude_ai_Trello__trelloReadBoard"
expect none "mcp__ide__getDiagnostics"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
