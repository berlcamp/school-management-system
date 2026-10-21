# School coordinator designations — design

Date: 2026-10-21 · Migration: **216** (next free number)

## Intent

Small schools hand teachers extra jobs: ARAL Coordinator, Reading Coordinator, Department Head,
Grade Level Coordinator. Today none of these exist in the system, so the work either falls back on
the School Head / Admin or the teacher is given a whole staff role they should not have. This adds
the four jobs as **designations on top of a person's account**. The holder keeps their normal menu
(usually the Teacher Menu), and the coordinator pages appear as extra items. They do **not** switch
roles to use them.

This is deliberately **not** a new `sms_users.type` and not a 163 extra role. Those work one at a
time ("acting as"). A designation adds powers that apply while the person is in their normal role.
The model is 121's supervision observers ("a designation, not a role"), except that the designation
**carries over from year to year until it is removed**. It is not set per school year.

## The four designations

| Designation | Label | Extra settings | What it unlocks |
|---|---|---|---|
| `aral_coordinator` | ARAL Coordinator | none | Everything the School Head can do in ARAL for the school: the `canManage` branches in `aral/page.tsx`, `aral/[program]/page.tsx` (every section in the school, not just own) and `aral/tutors` |
| `reading_coordinator` | Reading Coordinator | none | The school's **Assessments** page `/school/assessments` (CRLA / Phil-IRI / RMA materials, including file uploads), same as School Head / Admin get today via `hasStaffAccess` |
| `department_head` | Department Head | **subjects** (checkbox list) | A scoped Subjects page, schedules for their subjects, and the Department MPS dashboard. See below |
| `grade_level_coordinator` | Grade Level Coordinator | **grade levels** (checkbox list) | For sections in those grade levels: change the teacher on an existing schedule, and change the section adviser. Nothing else |

A person may hold any number of designations. Each one belongs to **one school**. Per invariant 13
(134), it takes effect only while that school is the holder's **active** school (`sms_users.school_id`).
It applies **whatever `type` they are currently acting as** (163). Being a designation rather than a
role is exactly what makes that the right behaviour.

### Department Head in detail

- **Subjects:** sees a Subjects list showing only their subjects. May **create** new ones and
  **edit only `code`, `name` and `description`** of their subjects (user's decision). Every field
  that moves grades or the curriculum stays with the 115 roster (School Head / Assistant / Admin /
  Registrar): `grade_level`, `program` / `is_madrasah` / `selective_enrolment` (invariant 15),
  `mapeh_component`, `tle_component`, `comm_component`, `shs_category`, `units`, `is_graded`,
  `special_program_id`, `specialization_id`, `is_active`, `school_id`. This is enforced by a **BEFORE
  UPDATE guard trigger** on `sms_subjects`, built like the GLC one: when the caller's only authority
  over the row is Department Head, any change outside the three allowed columns is refused. The
  edit form disables those fields for them. *Our call:* on **create**, the Department Head fills in
  the full form, because a subject with no grades yet has nothing to move and they cannot create a
  usable subject without its grade level. After that, the locked fields are locked. A subject they create is **automatically assigned to them**. This is done by a
  database trigger rather than client code, so it cannot be skipped. They may **not delete** a subject,
  which stays with School Head / Admin (115's delete roster). They cannot unassign themselves.
- **Schedules:** add, edit and remove `sms_subject_schedules` rows for **their subjects only**, in
  **sections that already exist**. They cannot create, edit or delete sections. Everything about
  schedules still applies: one row per time block, the 124 conflict override, the 136 ALS pairing and
  the 138 cross-school teacher check.
- **Department MPS dashboard (layout A, "coverage grid", chosen by the user):**
  - Filters: School year (default current), Subject (default all of mine), "Show missing only".
  - Tiles: *encoded / expected* for the selected period, *missing* count, *average MPS*.
  - Grid: one row per (subject, section) that has at least one `sms_subject_schedules` row in that
    school year. Columns: Subject, Section, Teacher (the schedule's `teacher_id`), then one column per
    grading period. Show **Term 1–3** for school years from `TERM_SYSTEM_START_SY` (2026-2027) and
    **Q1–Q4** before that (`lib/utils/schoolYear.ts`). A cell shows the MPS figure, or a red
    **Missing**. A future period shows "—". If the schedule rows for one (subject, section) name
    different teachers, list them all.
  - **Source of the MPS figure (our call, after the review found `sms_mps` is no longer used):** the
    same exam-derived MPS the `/mps` module computes from `sms_exam_results` → `sms_exams` →
    `sms_tos` (all exam types for the period averaged, exactly as `/mps` does), so the two screens
    always agree. Teachers no longer type an MPS; "Missing" means **no exam result recorded** for that
    subject, section and period. A result belongs to a scheduled (subject, section) by
    `sms_tos.subject_id` when it is set, otherwise by TOS `subject_name` + grade level matching the
    subject's name + grade level, which is the key `/mps` already groups on. Factor the aggregation out
    of `mps/page.tsx` into a shared helper rather than copying it.
  - The expected set is the same as Grade Monitoring's (107): a class owes MPS if it is scheduled.
  - Below the grid: a bar chart of MPS by section for the selected subject and period, reusing
    `mps/components/MpsBarChart.tsx`. Mastery-level colouring follows the existing MPS module.
  - Read-only. Encoding MPS stays with the teacher on `/teacher/mps`.

### Grade Level Coordinator in detail

For sections whose `grade_level` is one of the ticked grade levels, at their active school:

- change `teacher_id` on an existing `sms_subject_schedules` row. They cannot change day, time, room,
  subject, or add or remove rows. *Our call:* `conflict_override` is also allowed, so a GLC can tick
  124's "Save anyway" when the new teacher is double-booked on purpose (combined classes). The edit
  form shows that checkbox only when a conflict is detected, as it does today;
- change `sms_sections.section_adviser_id`. They cannot change any other section field.

## Setting designations: the Staff page

`/staff` → Add / Edit staff (`staff/AddModal.tsx`) gains a **Designations** section with four checkboxes:

- ticking **Department Head** shows a checkbox list of the school's active subjects (code, name and
  grade level, grouped by grade level, searchable). *Our call:* a subject may have more than one
  Department Head, and the list shows who else already heads a subject so a clash is visible rather
  than forbidden;
- ticking **Grade Level Coordinator** shows grade-level checkboxes (Kinder through 12, as the school's
  sections use them). At least one is required;
- unticking a designation removes it and its subject links on Save.

Only **School Head, Assistant School Head, Admin** of that school (active), plus `division_admin` /
`super admin`, can see and save this section. The same rule is enforced in RLS. *Our call:*
`division_admin` is admitted by the database only. `/staff` (behind `StaffGuard`) is not opened to
them and gets no school picker, since `/division/users` is a non-goal. The holder must be
assigned to the school (`sms_user_schools`, 134). The Staff list shows the designations as badges.

*Our call:* login-disabled personnel types (`accounting`, `security_guard`, `utility_worker`) cannot
be designated, since they never sign in. Any other school staff type can, though in practice it will
be teachers.

## Data model (migration 216)

New objects only. No DML on existing rows.

- **`sms_staff_designations`**: `id`, `user_id` → `sms_users` ON DELETE CASCADE, `school_id` →
  `sms_schools` ON DELETE CASCADE, `designation` TEXT **CHECK** in the four values (CHECK rather than
  free TEXT per 133/153, because each value carries behaviour), `grade_levels INTEGER[]` (CHECK: not
  null and non-empty iff `grade_level_coordinator`, null otherwise), `created_by`, `created_at`,
  `updated_at`. UNIQUE (`user_id`, `school_id`, `designation`). FKs are added in a guarded `DO` block
  per 116/163.
- **`sms_department_head_subjects`**: `id`, `user_id` → `sms_users` CASCADE, `subject_id` →
  `sms_subjects` **CASCADE** (deleting a subject drops the link, per the 116 lesson that the delete
  rule is what bites), `school_id`, `created_at`. UNIQUE (`user_id`, `subject_id`). A trigger requires
  a matching `department_head` designation at the subject's school. Removing the designation deletes
  its links in the same transaction.
- **Helper functions** (SECURITY DEFINER, pinned `search_path`, revoked from PUBLIC/anon and granted
  only where a policy needs them, per 194):
  - `sms_has_designation(p_designation text, p_school_id bigint) → boolean`: caller's
    `sms_users.school_id = p_school_id`, active account, and a matching designation row.
  - `sms_heads_subject(p_subject_id bigint) → boolean`: a link exists and its school is the caller's
    active school.
  - `sms_glc_covers(p_school_id bigint, p_grade_level int) → boolean`.
  - `sms_may_manage_designations(p_school_id bigint) → boolean`: School Head / Assistant / Admin at
    that active school, or division_admin / super admin.
- **Auto-assign trigger:** AFTER INSERT on `sms_subjects`. If the inserting user
  (`auth.uid()`) holds `department_head` at `NEW.school_id` (active), insert the link.

### RLS changes (additive branches; existing branches kept verbatim)

| Table | Change |
|---|---|
| `sms_staff_designations`, `sms_department_head_subjects` | SELECT: authenticated, same as other staff lookups. INSERT/UPDATE/DELETE: `sms_may_manage_designations(school_id)` |
| `sms_subjects` | INSERT: add `OR sms_has_designation('department_head', school_id)`. UPDATE: add `OR sms_heads_subject(id)` (USING and WITH CHECK), plus the column guard trigger above limiting a Department Head to `code` / `name` / `description`. DELETE: unchanged |
| `sms_subject_schedules` | INSERT/DELETE: add `OR sms_heads_subject(subject_id)`. UPDATE: add `OR sms_heads_subject(subject_id) OR (GLC of the section's grade level)`. A **BEFORE UPDATE guard trigger** refuses any column change other than `teacher_id` / `conflict_override` when the caller's only authority over the row is GLC (not a 115 roster role and not head of that subject) |
| `storage.objects` (`crla-materials/`, `philiri-materials/`) | Re-create 215's six policies verbatim with `OR sms_has_designation('reading_coordinator', <caller's active school>)` added |

Policies are re-created from their **live** definitions (check `pg_policies` on the local clone first,
per 201/214), since files and live schema are known to drift.

### Enforcement: honest limits

The user was told "the database will refuse anything outside these limits". That holds for
**subjects, schedules and assessment file uploads**. It does **not** fully hold for three areas that
are already wide open to any `authenticated` user before this change:

- **`sms_sections`** (001: INSERT/UPDATE/DELETE open to authenticated). The GLC "adviser only" limit
  and the Department Head "no section edits" limit are therefore **app-layer** here.
- **ARAL tables** (097: all open to authenticated). The ARAL Coordinator gate is app-layer, the same
  as the School Head's ARAL gate today.
- **Assessment material tables** (106: open to authenticated). Only the storage uploads are DB-gated.

Tightening those tables is a behaviour change for every existing writer and is **out of scope** here.
It should be listed as follow-up work and pointed out to the user at hand-off.

## App changes

- `lib/constants/designations.ts`: the four keys, labels, and `DESIGNATION_REQUIRES` (subjects /
  grade levels). This is the app twin of the CHECK.
- `hooks/useDesignations.ts`: loads the current user's designations for their active school (and
  Department Head subject ids, GLC grade levels) into Redux `userSlice`, alongside the existing
  user load in `AuthGuard`. It refetches on school switch.
- **Sidebar (`AppSidebar`):** append items when designated: *ARAL Coordinator* → the existing `/aral`
  item now has manager powers (no new item). *Reading Coordinator* → Assessments (`/school/assessments`).
  *Department Head* → Department (`/department`, the MPS dashboard), Subjects, Schedules.
  *Grade Level Coordinator* → Sections, Schedules.
- **Reuse the existing staff pages, scoped** (*our call*, so there is no parallel copy of each module):
  `/subjects`, `/schedules`, `/sections` and the section's Manage Schedules modal accept a designated
  teacher. Lists are filtered to their subjects or grade levels. Add / Edit / Delete controls are shown
  only for what the designation allows (e.g. a GLC's schedule edit form shows only the Teacher field
  enabled; a GLC's section edit shows only Adviser). Any page-level role gate on those routes is
  widened to "role OR designation".
- `aral/*`: `canManage` becomes "role in (school_head, admin, super admin) OR has `aral_coordinator`".
  This also covers `aral/[program]/page.tsx`'s "see every section" branch.
- `school/assessments`: open to `hasStaffAccess || reading_coordinator`.
- New route `app/(protected)/department/page.tsx` with co-located `components/` for the coverage grid.

## Goals / non-goals / anti-goals

**Goals:** the four designations, set on `/staff`, carrying over until removed. Each one unlocks
exactly what is listed above. Department Head auto-assignment on create. Department MPS coverage grid.

**Non-goals:** setting designations from `/division/users`. Per-school-year history of who held a
designation. Notifications to teachers with missing MPS. Printing the dashboard. Tightening RLS on
`sms_sections`, ARAL or assessment material tables (follow-up).

**Anti-goals:** a designation must never widen access beyond its scope. A Department Head must not
touch another department's subjects or schedules, and a GLC must not touch other grade levels or any
field but teacher/adviser. A designation must never behave like a role switch: the holder keeps the
Teacher Menu. Nothing that exists today (115 rosters, 124/136/138 schedule rules, MPS encoding)
may change for anyone who holds no designation.

## Testing

- `supabase/tests/216_staff_designations.sql` (one transaction, rolled back, per 194/198), on the
  local stack only. It covers: designation CRUD by head/admin and refusal for a teacher; Department
  Head insert subject → auto-link; update own vs other subject; locked-column change refused (e.g. `is_madrasah`, `grade_level`); schedule insert/update/delete own vs
  other subject; GLC teacher change allowed, time/room change refused, other grade refused; designation
  ignored after switching active school; removal drops links; reading coordinator storage insert.
- Vitest for the coverage-grid builder (expected set, period columns by school year, multi-teacher
  rows).
- Manual run on the local clone (`npm run dev` with `.env.development.local` present).

## Hand-off

Per Rule 6, the user applies migration 216 to production. Hand over the file, what it changes, and
that it touches **no existing rows**.

## Left to the builder

Exact component structure, whether the coverage grid is one RPC or client queries (client queries are
fine; `sms_mps` and schedules are readable), the badge styling on the Staff list, and how the subject
checklist paginates in large schools.
