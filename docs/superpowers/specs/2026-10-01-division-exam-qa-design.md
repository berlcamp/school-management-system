# Division TOS & Examinations with QA Approval — Design

Date: 2026-10-01 · Migration: **194** · Status: approved in conversation, pending spec review

## 1. Intent

Division-wide Tables of Specification and examinations are written by
**teachers a QA reviewer has authorized**, and reach the division only after a
**QA reviewer approves** them. The division office stops authoring them
directly. Personal and school-wide TOS / exams (migration 160's `private` and
`school` tiers) keep working exactly as they do today.

> Teacher ownership determines who creates the content; QA approval determines
> whether that content becomes division-wide.

### Decisions taken in brainstorming

| # | Question | Decision |
|---|---|---|
| 1 | May the division office still publish division TOS / exams directly? | **No.** Every new division row comes from a QA-authorized teacher through QA. Existing division rows are grandfathered as `approved`. |
| 2 | Who controls the release code (161) on an approved division exam? | **Division office and QA.** Not the authoring teacher. |
| 3 | Who may build an exam from an approved division TOS? | **Any currently authorized teacher.** Each exam has its own author. |
| 4 | Who is QA? | **`qa` is an ordinary `sms_users.type` value**, held as a primary role or an additional 163 role. Self-review is refused in the database. |
| 5 | Approach | **Option 1: `review_status` on the existing rows**, not a side table and not copy-on-approve. |

### Assumptions (stated, not asked)

- Authorization is division-wide, not per subject or grade level.
- Revoking a teacher freezes their unfinished drafts (no further edits or
  submissions); their approved content stays published and their pending
  submissions may still be decided.
- An approved TOS or exam — including its questions, options and answer key —
  is immutable. Correction is `reopen` (only when nothing depends on it) or a
  new set.
- The system serves one division (Bayugan City); there is no division id.
  "Division isolation" = division roles act on division rows, school roles act
  on their own school. No division table is introduced.

## 2. Existing state this builds on

- `sms_tos` (096) and `sms_exams` (099) carry `school_id` NULL = division tier,
  plus 160's `is_school_shared`. Tiers are app-layer (`lib/utils/examVisibility.ts`).
- **Every exam/TOS table's RLS is `auth.role() = 'authenticated'` for all four
  commands** (096/099), except the five paper tables' SELECT, replaced by 161 with
  `can_read_exam_paper(exam_id)`.
- `TosBuilderModal`, `ExamBuilderModal`, `TosList` take `mode: "division" | "teacher"`.
- `/division/examinations` lets `division_admin` / `division_type` author
  division rows; `can_manage_exam` (161) gives division roles the release code on
  division exams and authors on their own.
- `sms_users.type` is the active role (invariant 12); `sms_user_roles` is the
  permitted set (163). The type CHECK was last replaced by 158.
- No generic audit table exists; features keep their own history (121, 129, 154).
- Notifications: `createNotification` in `lib/notifications/service.ts` (`adm_notifications`).

## 3. Data model (migration 194)

### 3.1 Role
- Replace `sms_users_type_check` adding `'qa'` (158's pattern). Division-level:
  `school_id` NULL.
- `lib/constants/userTypes.ts`: label `"QA Reviewer"`; add to
  `DIVISION_ASSIGNABLE_USER_TYPES`. `SchoolIdGuard` must admit `qa` with a NULL
  school, as it does `division_type` (verify during implementation).
- **Multi-role QA (decided in planning):** `sms_switch_active_context` (163)
  refuses a NULL school, so a person who also teaches holds `qa` *at their
  school* in `sms_user_roles` — which is what `/division/users`' "Also works
  as" picker already writes. A dedicated QA account is `type = 'qa'`,
  `school_id` NULL. `is_exam_qa()` reads the active type only.

### 3.2 Columns on `sms_tos` and `sms_exams` (identical on both)

| Column | Type | Notes |
|---|---|---|
| `review_status` | TEXT NULL, CHECK IN (`draft`,`submitted`,`under_review`,`approved`,`rejected`) | NULL for private / school-wide rows |
| `submitted_at` | TIMESTAMPTZ NULL | latest submission |
| `reviewed_by` | BIGINT NULL → `sms_users(id)` ON DELETE SET NULL | QA who started or decided the latest review |
| `reviewed_at` | TIMESTAMPTZ NULL | |
| `review_comment` | TEXT NULL | latest decision's comment / rejection reason |

Constraint `*_review_status_tier`: `(school_id IS NULL) = (review_status IS NOT NULL)`.
No separate `DIVISION_AVAILABLE` value — it is `approved`.

### 3.3 `sms_exam_qa_authors`
`id`, `user_id` BIGINT UNIQUE → `sms_users` ON DELETE CASCADE, `is_active` BOOLEAN,
`authorized_by` → `sms_users`, `authorized_at`, `revoked_by` → `sms_users`,
`revoked_at`, `revoke_reason`, `created_at`, `updated_at`. Re-authorizing
reactivates the row (clears revoke fields). History lives in 3.4.

### 3.4 `sms_exam_review_events` (append-only audit)
`id`, `entity_type` TEXT CHECK IN (`tos`,`exam`,`author`), `entity_id` BIGINT,
`actor_id` → `sms_users` ON DELETE SET NULL, `action` TEXT CHECK IN
(`authorize`,`revoke`,`submit`,`withdraw`,`start_review`,`approve`,`reject`,`reopen`),
`from_status`, `to_status`, `comment`, `created_at`. Index on
(`entity_type`, `entity_id`, `created_at`). RLS on; SELECT policy per §4.5; **no
INSERT / UPDATE / DELETE policies** — only the §5 functions write it.

### 3.5 Migration order and backfill
1. Add columns nullable.
2. `UPDATE … SET review_status = 'approved', reviewed_at = created_at WHERE school_id IS NULL`
   on both tables — **the only DML**. Count recorded in the migration header from
   the local clone.
3. Add the tier constraint.
Private / school-wide rows are not touched.

## 4. Enforcement (RLS + triggers)

Principle: **every policy keeps today's behaviour for rows whose `school_id` is
set; only division rows gain rules.**

### 4.1 Helpers (SECURITY DEFINER, STABLE, `SET search_path = procurements, public`)
Resolve the caller as `sms_users WHERE user_id = auth.uid()` (161's idiom), on
the active `type`.
- `exam_me_id()` → caller's `sms_users.id`.
- `is_exam_qa()` → active type `qa` or `super admin`.
- `is_exam_oversight()` → `division_admin`, `division_type`, `super admin`.
- `is_division_author()` → active type in (`teacher`,`volunteer_teacher`) **and**
  an active `sms_exam_qa_authors` row.
- `can_see_division_row(status, created_by)` → `status = 'approved'` OR author
  OR `is_exam_qa()` OR `is_exam_oversight()`.
- `can_edit_tos(tos_id)` / `can_edit_exam(exam_id)` → parent `school_id` set
  (unchanged behaviour) OR (author AND `is_division_author()` AND status IN
  (`draft`,`rejected`)).

### 4.2 `sms_tos`, `sms_exams` policies (replace 096/099's four)

| Cmd | Rule |
|---|---|
| SELECT | `school_id IS NOT NULL OR can_see_division_row(review_status, created_by)` |
| INSERT | `school_id IS NOT NULL OR (is_division_author() AND created_by = exam_me_id() AND review_status = 'draft')` |
| UPDATE | USING / WITH CHECK: `school_id IS NOT NULL OR can_edit_*(id)` |
| DELETE | `school_id IS NOT NULL OR (can_edit_*(id) AND` no `approve` event exists for it`)` |

The division office's INSERT path is removed by this — intended (decision 1).

### 4.3 Triggers
- `guard_review_fields` (BEFORE UPDATE, both tables): refuses any change to
  `review_status`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_comment`
  unless `current_setting('sms.exam_review', true) = 'on'`, which only §5
  functions set (`set_config(..., true)` — transaction-local). Also refuses
  `school_id` crossing NULL ↔ non-NULL in either direction.
- `guard_exam_tos` (BEFORE INSERT OR UPDATE OF `tos_id`, `school_id` on `sms_exams`):
  if the referenced TOS is a division row it must be `approved`; if the exam is a
  division row its TOS must be a division row (and approved).
- `guard_exam_result_release` (BEFORE INSERT on `sms_exam_results`): refuses a
  division exam not `approved`.

### 4.4 Child tables
- `sms_tos_competencies`, `sms_tos_items`: SELECT = parent TOS's SELECT rule;
  INSERT / UPDATE / DELETE = `can_edit_tos(tos_id)`.
- `sms_exam_questions`, `_options`, `_subitems`, `_sections`, `_answer_keys`:
  INSERT / UPDATE / DELETE = `can_edit_exam(exam_id)` (resolved through
  `question_id` for options / sub-items). SELECT stays `can_read_exam_paper`.
- `can_read_exam_paper` (161) extended: a division exam not `approved` is
  readable only by its author, `is_exam_qa()`, `is_exam_oversight()` — checked
  before the release-code branches.
- `can_manage_exam` (161) replaced, same signature: division exam →
  `review_status = 'approved' AND (is_exam_oversight() OR is_exam_qa())`, author
  branch **dropped for division exams**; school-level branches unchanged.

### 4.5 Audit and authorization SELECT
- `sms_exam_review_events`: QA and oversight see all; a user sees events whose
  entity is a TOS / exam they authored, or `entity_type = 'author'` with
  `entity_id` = their own `sms_exam_qa_authors.id`.
- `sms_exam_qa_authors`: SELECT for QA, oversight, and the row's own user. No
  write policies — §5 functions only.

### 4.6 Deliberately out of scope
- Private / school-wide visibility stays app-layer (160).
- `sms_student_subjects`-style hardening of unrelated tables.
- Retiring (`is_active = false`) an approved division row. Approved rows are
  immutable to everyone; a retire action can be added later as another §5
  function if the division needs it.

## 5. Workflow functions

All SECURITY DEFINER with pinned search_path; check the active role; set
`sms.exam_review = on`; write a `sms_exam_review_events` row in the same
transaction; `RAISE EXCEPTION` with a user-readable message on refusal. Review
functions take `p_entity TEXT` (`'tos' | 'exam'`) and `p_id BIGINT`.

| Function | Caller | Transition | Checks |
|---|---|---|---|
| `exam_qa_authorize(p_user_id)` | QA | — | target holds `teacher`/`volunteer_teacher` as `type` or in `sms_user_roles`; upsert-reactivate |
| `exam_qa_revoke(p_user_id, p_reason)` | QA | — | reason required; row active |
| `exam_review_submit` | author, `is_division_author()` | `draft`/`rejected` → `submitted` | exam: TOS still `approved`, ≥ 1 question |
| `exam_review_withdraw` | author | `submitted` → `draft` | not `under_review` |
| `exam_review_start` | QA | `submitted` → `under_review` | sets `reviewed_by`; another QA may still decide |
| `exam_review_decide(p_entity, p_id, p_decision, p_comment)` | QA | `submitted`/`under_review` → `approved`/`rejected` | caller ≠ `created_by`; comment required on reject; exam: TOS still `approved` |
| `exam_review_reopen(p_entity, p_id, p_comment)` | QA | `approved` → `draft` | exam: no `sms_exam_results` rows; TOS: no `sms_exams` row references it; comment required; refused for a grandfathered row (no `approve` event) — its author is a division-office account that can no longer edit, so reopening would strand it |

- Rejected stays `rejected` (reason visible) until resubmitted;
  `rejected → submitted` is direct.
- TOS-conformance (question count vs TOS items, per competency and cognitive
  level) is shown to QA, **not** enforced — a count mismatch can be deliberate.
- Revocation does not cancel pending submissions.
- Notifications via `createNotification` after the RPC succeeds, best-effort:
  every active QA user on `submit`; the author on `approve` / `reject` / `reopen`.

## 6. UI

### Teacher — `/teacher/examinations`
- Hub split: **Personal / School** (existing three cards, untouched) and
  **Division** (Division TOS, Division Exams).
- Unauthorized: Division group shows *"You are not currently authorized to
  create Division TOS. Please contact the Division QA administrator."*;
  approved division material stays browsable as today.
- Authorized: `/teacher/examinations/division/tos` and `/division/exams` — own
  division rows, status badge, latest QA comment, Submit / Withdraw; builders
  reused in `mode="division"`, read-only unless `draft`/`rejected`; exam
  builder's TOS picker offers approved division TOS only; **Create Examination**
  on an approved TOS row preselects it.

### QA — `/qa` (sidebar group for active type `qa`)
- Overview counters: Pending TOS, Pending Exams, Authorized Teachers, Approved TOS, Approved Exams.
- Pending TOS: TOS · Subject · Grade Level · Teacher · School · Submitted · Status · Action.
- Pending Exams: Exam · TOS · Subject · Grade Level · Teacher · School · Submitted · Status · Action.
- Review pages: TOS via `TosPreviewTable` / `TosViewModal`; exam via
  `ExamPreview` (options + answer key) + new conformance panel; event history;
  Approve / Reject / Reopen with comment.
- Approved TOS / Approved Exams lists; approved exams carry `ExamReleaseCodeCard`.
- Authorized Teachers: search, school filter, Authorize / Revoke (reason),
  per-teacher history.

### Division office — `/division/examinations`
- Create buttons removed; lists show every status read-only with history;
  release code and Item Analysis unchanged. `/division/users` offers `qa`.

### Shared code
- `lib/constants/examReview.ts`: statuses, labels, badge classes, transition
  table, action names (mirrors the SQL, `classRecord.ts` precedent).
- `lib/utils/examReview.ts`: RPC wrappers; pure `canEditReviewRow`,
  `tosConformance`.
- `visibleTierFilter`: division clause becomes
  `and(school_id.is.null,review_status.eq.approved)` (author's own division rows
  are fetched by the division-specific lists). Courtesy only; RLS is the gate.

## 7. Tests
1. `supabase/tests/194_exam_qa_review.sql` — local only, in a rolled-back
   transaction, impersonating via `request.jwt.claims`. Asserts refusal of:
   unauthorized division insert; division-office insert; author writing
   `review_status`; self-approval; exam on draft/rejected/personal TOS as a
   division exam; tier crossing; editing an approved question / answer key;
   reopen with results; result row on an unapproved division exam. Asserts
   success of the full happy path, and that private / school-wide rows behave as
   before for insert/update/delete/select. Asserts the backfill count.
2. vitest: transition table, `canEditReviewRow`, `tosConformance`,
   `visibleTierFilter` clause.
3. Playwright (existing intercepted setup, port 3123): unauthorized notice;
   authorized submit; QA reject with reason; teacher sees reason.
4. Manual walkthrough on the local clone. Applying 194 to production is the
   user's job (rule 6).

## 8. Documentation
- CLAUDE.md: migration 194 row; feature-table row; new invariant —
  *a division TOS/exam's visibility is its `review_status`, and only the
  `exam_review_*` functions change it.*

## 9. Backward compatibility checklist
- Private / school-wide rows: no column populated, every policy branch unchanged.
- Existing division rows: `approved` on apply → still visible, results / scans /
  release codes unaffected; now immutable (they were editable by the division
  office before — intended).
- `can_manage_exam`, `can_read_exam_paper`: same signatures; callers untouched.
- Existing roles: type CHECK only widened.
