# Division Report Generator — Implementation Plan

Branch: `feat/division-report-generator`
Status: Phases 1-5 complete; Phases 6-7 outstanding
Approach: **B — curated datasets, server-side whitelist, `SECURITY DEFINER` RPC**

---

## 1. What this is

A report builder at `/division/reports/builder` where a division user picks:

1. **a dataset** (Learners, Enrollment, Staff, …) — not a table, a pre-joined wide view
2. **the columns** to display, in order
3. **the filters** to apply, per column, with operators appropriate to the type

…then previews the result and exports it to Excel, CSV, or the DepEd printable.

It sits **beside** the 16 fixed reports under `/division/reports`, it does not replace
them. The fixed reports encode DepEd form shapes (grouping, subtotals, signatories,
submission semantics); the builder answers the one-off question nobody wrote a page for.

## 2. Why the whitelist lives in the database

The anon key ships in the browser bundle, so a gate that only hides a picker is lifted
with F12 — the migration 161 lesson. Everything the client sends is therefore treated as
untrusted:

- **column names** are matched against a metadata table; an unknown name is *dropped*,
  never interpolated
- **filter operators** are matched against a per-type allowlist
- **filter values** are `quote_literal`-escaped and cast to the field's declared type
- **the access decision is one explicit guard** in the RPC, not a policy scattered over
  five tables (the 156/157 lesson)

A division report must read *every* school. School-scoped SELECT policies hand a division
user an empty set — which is the exact bug migration 157 was written to fix — so the RPC
is `SECURITY DEFINER` with a pinned `search_path`, and the guard is what stands in for RLS.

## 3. Architecture

```
components/division-reports/…            (existing shell, school + SY filters — reused)
app/(protected)/division/reports/builder/page.tsx     ← new UI
  └── lib/utils/reportBuilder.ts         ← types, fetchDatasets(), runReport()
        └── rpc division_report_run(...) ← procurements, SECURITY DEFINER, the guard
              ├── reporting.v_report_*   ← wide pre-joined views (NOT PostgREST-exposed)
              └── sms_report_datasets / sms_report_dataset_fields   ← the whitelist
  └── lib/pdf/generateCustomReport.ts    ← generic printable on reportShell.ts
```

### 3.1 The views live in an unexposed schema

`supabase/config.toml` exposes `["public", "graphql_public", "procurements"]`. A view has
no RLS of its own and runs with its owner's rights, so a `v_report_learners` sitting in
`procurements` would be **a cross-school read for any authenticated user holding the anon
key**. The views therefore go in a new `reporting` schema, which is *not* in the exposed
list, and are additionally declared `WITH (security_invoker = true)` as a second line of
defence. Only the RPC — which is in `procurements` and carries the guard — reaches them.

> ⚠ Production's exposed-schema list is set in the Supabase dashboard, not in this repo's
> `config.toml`. **Before the migration is applied to production, confirm `reporting` is
> not in the dashboard's exposed schemas.** This is a checklist item for the user, not
> something the code can enforce.

### 3.2 The whitelist is one source of truth

Two metadata tables, seeded by the migration:

- `sms_report_datasets` — `key`, `label`, `description`, `view_name`, `requires_school_year`
- `sms_report_dataset_fields` — `dataset_key`, `field_key`, `label`,
  `data_type` (`text|number|date|boolean|enum`), `enum_source`, `filterable`,
  `default_selected`, `sort_order`

> **Deviation from this plan, as built:** there is no `sql_expression` column.
> `field_key` IS the column name in the dataset's view, so the only thing ever
> interpolated is a quoted identifier that already matched the catalogue. Any
> expression a report needs lives in the view, written by a migration. This
> removes the injection surface the plan was prepared to tolerate.

The **UI reads these tables to build the column and filter pickers**, and the **RPC
validates against the same rows**. TS and SQL cannot drift, which is the failure mode a
hand-mirrored registry in `lib/constants/` would have had.

RLS on both: `SELECT` for `authenticated` (they are labels), and **no INSERT/UPDATE/DELETE
policies at all** — the 161 pattern — so PostgREST cannot write them under any role.
Only a migration or `service_role` writes them.

### 3.3 The RPC returns JSONB, not a typed row

```sql
division_report_run(
  p_dataset      TEXT,
  p_columns      TEXT[],
  p_filters      JSONB,      -- [{"field":"grade_level","op":"in","value":[1,2]}]
  p_school_id    BIGINT,     -- NULL = division-wide, per the 106/118/125/157 convention
  p_school_year  TEXT,
  p_limit        INT DEFAULT 1000,
  p_offset       INT DEFAULT 0
) RETURNS TABLE (row_data JSONB)
```

A `RETURNS TABLE` with one declared type per column is compared to the query's actual
output types **exactly, at call time** — `character varying` is not `text`, `integer` is
not `bigint` — which is how migration 156 shipped clean and failed on its first call.
A dynamic column list makes that check impossible to satisfy in advance. Returning
`jsonb_build_object(...)` per row sidesteps the whole class: one declared column, always
`jsonb`, and the client receives `Record<string, unknown>[]` — exactly the shape
`exportExcel` and `exportCsv` already take.

`division_report_count(...)` mirrors the signature and returns the unpaginated total.

### 3.4 The guard

Copied from migration 157, narrowed to the division office for v1:

```sql
u.type IN ('division_admin', 'super admin', 'division_type')
```

`p_school_id IS NULL` (division-wide) admits only those three. A named school additionally
admits that school's own staff and its migration-134 assignees — which is what lets the
`/school-reports` module (164) reuse the same RPC later without a second guard.

Note `sms_users.type` is the **active** role (invariant 12): the guard asks what the user
is acting as right now, like every other `type` check in the system. It is never widened
to "any assigned role".

## 4. The datasets

Wide and already denormalized, so "pick your columns" is genuinely a column subset and the
user never designs a join. v1 ships three; the rest follow the same recipe.

| Dataset | Grain | Notable pre-joined columns |
|---|---|---|
| `learners` | one row per student | school name/district, current section, grade level, sex, age, barangay, 4Ps, IP group, mother tongue, LRN, guardian |
| `enrollment` | one row per enrollment (student × SY × semester) | school, SY, semester, grade level, section, status, lifecycle status, balik-aral, transfer in/out, origin/destination school |
| `staff` | one row per `sms_users` row | school, role, position, employee id, sex, learning area, staff category, active |
| `sections` *(phase 6)* | one row per section | school, SY, grade level, type, strand, adviser, room, enrolled count |
| `rooms` *(phase 6)* | one row per room | school, type, condition, dimension, section assigned |

Type traps to handle **in the view**, per invariant 11:

- `sms_students.grade_level` is `TEXT`; `sms_enrollments.grade_level` is `INTEGER`
- `sms_users.name` / `email` / `position` are `character varying`
- `sms_school_settings.school_id` is `TEXT` where the rest are `BIGINT`

Every column is cast to its declared type in the view, per 157 — no-ops where the migration
files were right, immunity to the drift where they were not.

## 5. Phases

Each phase is independently testable against local Supabase and leaves `main` shippable.

### Phase 1 — Migration 166 (the engine) — DONE
`supabase/migrations/166_division_report_generator.sql`
- `CREATE SCHEMA reporting`
- `reporting.v_report_learners`, `v_report_enrollment`, `v_report_staff`
- `sms_report_datasets`, `sms_report_dataset_fields` + seed rows + RLS (161 pattern)
- `division_report_run`, `division_report_count`
- Header documenting: what it touches (nothing existing), the exposed-schema check, the
  guard, and the row cap

Verified locally — 15 checks, all passing:

| # | Check | Result |
|---|---|---|
| 1 | division user, division-wide | rows |
| 2 | school head, division-wide | refused |
| 3 | school head, own school | 1,648 rows |
| 4 | unknown column | dropped, not fatal |
| 5 | unknown filter field | refused |
| 6 | `contains` on a boolean field | refused |
| 7 | `x'); DROP TABLE ...` as a filter value | 0 rows, table intact |
| 8 | literal `%` in a `contains` value | escaped, 0 rows |
| 9 | enrolment with no school year | refused |
| 10 | `run` vs `count` on the same filters | 190 = 190, matches a hand-written query |
| 11 | `p_limit = 999999` | clamped to 5000 |
| 12 | no JWT | refused |
| 13 | `SELECT` on `reporting.v_report_learners` as authenticated | permission denied for schema |
| 14 | `INSERT` into the catalogue as authenticated | RLS violation |
| 15 | sort + paging | page 2 follows page 1 |

Timing on the 21,012-learner clone: 114 ms for a 5,000-row division-wide page on the
default columns, 174 ms including the derived PWD / IP / 4Ps flags.

Also built, beyond what this plan specified: `division_report_operators(data_type)` so the
UI's operator dropdown and the WHERE builder read one list; `row_key` / `default_sort` on a
dataset plus `p_sort_field` / `p_sort_dir` / `p_offset` for sortable, pageable previews; and
an apply-time self-test that asserts the catalogue against the views' actual columns, so a
mismatch fails the migration in front of whoever is applying it rather than at first Run
(the 156 lesson).

### Phase 2 — `lib/utils/reportBuilder.ts` — DONE
Types (`ReportDataset`, `ReportField`, `ReportFilter`, `FilterOperator`), `fetchReportDatasets()`,
`runReport()`, `countReport()`, `runReportAll()` (pages to the server cap), `OPERATORS_BY_TYPE` +
`OPERATOR_META` (label and arity) for the filter UI, `enumOptions()` resolving a field's
`enum_source` against `lib/constants`, and the presentation half — `formatReportValue`,
`orderedFields`, `exportHeaders`, `toExportRows`, `isCompleteFilter`, `describeFilters`.
`tsc --noEmit` and `eslint` both clean; no `any`.

> **Correction to this plan:** filter values are sent **raw**. The server escapes ILIKE
> wildcards itself, so calling `escapeIlikePattern()` here as well would double-escape and
> a learner whose surname really contains an underscore would stop matching. "Both, not
> either" was wrong for escaping — it is right for *validation*, which is where the client
> and server genuinely do duplicate each other.

Verified over PostgREST as well as in psql: the RPC endpoint exists and refuses `anon`
(`permission denied for function`), the `reporting` schema answers 406 (not exposed) and
`v_report_learners` is 404 under the `procurements` profile.

### Phase 3 — the builder page — DONE
`app/(protected)/division/reports/builder/page.tsx` on `DivisionReportShell` with the
existing `SchoolFilter` / `SchoolYearFilter`, plus two co-located components:
`ColumnPicker` (popover checklist, chosen columns as reorderable chips) and
`FilterBuilder` (field + operator + a value control typed off `data_type`). Nothing runs
until **Run** is pressed. Export Excel / CSV are wired; Print arrives with Phase 4.

Two things the plan did not anticipate:

- **Ordering is click-order plus arrows, not drag-and-drop.** No dnd library is installed
  and this feature does not justify adding one to two lockfiles.
- **The run is frozen when Run is pressed** (`RunSpec`), and paging and sorting refetch
  against that snapshot rather than against the pickers' current state. Otherwise editing a
  filter and pressing Next would give you a page 2 that answers a different question from
  page 1.

The reports-index card moved here from Phase 7 — the page is unreachable without it, so it
could not be exercised.

`tsc --noEmit` and `eslint` clean. The route compiles and serves 200 on the dev server;
the builder itself renders behind `AuthGuard` / `DivisionGuard`, so **exercising it needs a
signed-in division account in a browser** — not yet done.

### Phase 4 — the printable — DONE
`lib/pdf/generateCustomReport.ts` on the existing `reportShell.ts`: DepEd header + logos,
landscape, dynamic `<th>` row from the column labels, `esc()` on every cell, signatory
block. Exported from `lib/pdf/index.ts` and wired to the shell's Print button.

Three things a fixed-column generator never has to decide, and how they were decided:

- **Column widths** are apportioned by `data_type` (text 3, enum 2, date 1.6, number 1.2,
  boolean 1) and normalised back to 100%, per the 152 Matrix rule. Equal thirteenths would
  spend as much page on "Sex" as on a learner's name.
- **Type size steps down with the column count** — 9pt to nine columns, then 7.5 / 6.5 /
  5.5. The shell's default wraps every cell once a report goes wide.
- **Alignment comes from the type**: right for a number, centre for a flag or a code, left
  for prose.

It prints the whole result set, not the page on screen, and it prints the rows it was
handed rather than re-querying — what prints is what the user saw and exported.

Signatories: one school is noted by its own school head (fetched like
`grade-level-teachers` does); the division-wide cut has no such record, so it prints a
blank line under "Schools Division Superintendent" — the paper convention — rather than an
empty name under "Principal".

Also refactored: `fetchDivisionHeader()` moved from inside `generateGradeLevelTeachers.ts`
into `reportShell.ts` and is now shared by both, rather than copied. Same body, so that
printable is unchanged.

### Phase 5 — Migration 167, saved definitions — DONE
`sms_report_definitions` (`owner_id`, `name`, `description`, `dataset_key`,
`columns TEXT[]`, `filters JSONB`, `sort_field` / `sort_dir`, `school_id`,
`is_division_shared BOOLEAN DEFAULT FALSE`). The `FALSE` default is load-bearing per the
153/160 rule — nothing becomes visible to a colleague on apply.

**The school year is deliberately not stored.** `school_id` is remembered — a report about
one school is still about that school next year — but a definition saved in 2025-2026 and
opened in 2026-2027 must default to the year the user is working in. Storing it would mean
every saved report quietly reported last year's figures until somebody noticed the
dropdown.

RLS verified with 9 checks on the clone, all passing: the author sees and edits their own;
a colleague sees neither until it is shared; a colleague who *can* see a shared one still
cannot edit or delete it; `division_admin` / `super admin` **can** edit a shared one (160's
rule — the division's own report has to be fixable when its author is on leave); an INSERT
naming somebody else as author is refused by the WITH CHECK; a blank name and a non-array
`filters` are refused by CHECK constraints.

Client: `fetchReportDefinitions` / `saveReportDefinition` / `updateReportDefinition` /
`deleteReportDefinition` / `canManageDefinition` in `reportBuilder.ts`, and a
`SavedReportBar` in the builder — a picker grouped into the user's own and the division's,
a save dialog with an overwrite option, and Delete for what the session may manage.

Reuses `sms_current_user_row_id` (134/163) and `update_updated_at_column` rather than
re-declaring either.

### Phase 6 — more datasets
Migration 168 adds `sections` and `rooms` views + their seed rows. No code change — the UI
is driven by the metadata tables.

### Phase 7 — tests
- Vitest over the filter-to-SQL shape and `OPERATORS_BY_TYPE`
- Playwright: pick dataset → columns → filter → run → export

## 6. Out of scope for v1

Written down so it is a decision, not an omission:

- **user-designed joins and cross-dataset unions** — that is a BI tool, not this
- **computed / derived columns** — a derived figure belongs in the view, reviewed once
- **aggregates and GROUP BY** — a plausible phase 8; the RPC signature already has room
  for `p_group_by`, but shipping counts before rows invites a subtotal that disagrees with
  a fixed report (the 165 lesson)
- **scheduled delivery and charts**

## 7. Risks and standing rules

- **Rule 0** — all of this is developed and tested against local Supabase only. Migrations
  166/167/168 are handed to the user with a row count and a description; applying to
  production is the user's job.
- **The unexposed `reporting` schema is the whole safety story for the views.** If it ever
  gets exposed, every school's learner roster is readable with the anon key. The migration
  header must say so and the dashboard must be checked before apply.
- **The whitelist is the security boundary.** No client string is ever interpolated as an
  identifier — only `field_key` values that matched a seeded row, rendered through `%I`.
- **Row cap.** `p_limit` is clamped server-side (default 1000, max 5000). The export path
  pages through rather than lifting the cap.
- Additive only: no existing table, column, policy, trigger or function is touched, and
  there is no DML against live data anywhere in the plan.
