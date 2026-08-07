# Enrollment & Promotion/Graduation Workflow — Code Audit Report

**System:** School Management System (SMS) for Schools Division of Bayugan City (DepEd)  
**Audit date:** 2026-04-02  
**Scope:** Enrollment wizard, auto-enroll (promoted/retained), promotion/graduation, two-stage transfer approval, section assignment for promoted students

---

## 1. Executive Summary

The enrollment and promotion workflows are largely correct and well-structured. The two-stage transfer approval introduced in migration 057 is sound in its database design and is faithfully reflected in the frontend. However, several issues were found:

| Severity | Issue |
|----------|-------|
| Medium   | TransferOutModal UI text incorrectly tells staff no record request will be needed — it will |
| Medium   | Migration 038 (old `enroll_student_with_record_request`) creates new enrollment with `enrollment_status = 'active'` instead of `'pending_transfer'`, contradicting the two-stage design |
| Medium   | `pending_review` status not handled in sync trigger (migration 056) — maps to default `'enrolled'` |
| Low      | TransferOutModal uses an unescaped `ilike` query on school search — SQL injection risk |
| Low      | RetainNlisModal (retain action) does not update `sms_students.enrollment_status` — sync trigger covers it, but explicit update is inconsistent with the NLIS branch |
| Low      | Graduated students: `sms_students.enrollment_status` is updated directly in `PromoteStudentModal` but the sync trigger in migration 056 also fires — dual update path, could diverge if trigger is ever changed |
| Info     | Promoted students always lose their `current_section_id` (cleared to NULL) — this is by design, not a bug |

---

## 2. Two-Stage Transfer Approval Audit

### 2.1 Flow Correctness

The two-stage flow is:

1. **Destination school** runs LRN lookup → student found at a different school → `entryMode = "transferee"` → calls `enroll_student_with_record_request` RPC.
2. RPC (migration 057 version):
   - Creates `sms_record_requests` with `status = 'pending'`.
   - If origin enrollment is `active`, updates it to `pending_transfer`.
   - Creates new enrollment at destination with `status = 'pending'` and `enrollment_status = 'pending_transfer'`.
   - Updates `sms_students.school_id`, `grade_level`, `current_section_id` (for backward compat).
3. **Origin school** sees incoming request in `IncomingRequestsTab` → approves/rejects via `respond_to_record_request`.
4. On approval: origin enrollment → `transferred_out`; destination enrollment → `enrollment_status = 'pending_review'`; `record_access_granted = TRUE`.
5. **Destination school** sees the enrollment in `PendingReviewsTab` → reviews student grades/history in `TransferRecordViewer` → calls `review_transfer_enrollment`.
6. On final approval: enrollment `status = 'approved'`, `enrollment_status = 'active'`; student record updated.

**This flow is correctly implemented end-to-end.**

### 2.2 Bug: Migration 038 `enroll_student_with_record_request` Creates Enrollment as `enrollment_status = 'active'`

**File:** `supabase/migrations/038_multi_school_transfers.sql`, lines 239–246

```sql
INSERT INTO procurements.sms_enrollments (
  ...
  status, enrollment_status, ...
) VALUES (
  ..., 'pending', 'active', ...   -- enrollment_status is 'active', not 'pending_transfer'
);
```

Migration 057 corrects this in its `CREATE OR REPLACE FUNCTION`, setting `enrollment_status = 'pending_transfer'`. Since migrations run sequentially and 057 replaces the function, **this is only a bug if any database was never migrated past 038 before 057**. On a fresh install running all migrations, the 057 version wins. However, if the 038 version was applied and used before 057 arrived, transferred students may have been created with `enrollment_status = 'active'` at the destination school — meaning they appeared fully enrolled when they weren't.

**Verdict:** Historical data risk; current code is correct after migration 057.

### 2.3 Bug: `pending_review` Not Handled in Student Status Sync Trigger

**File:** `supabase/migrations/056_sync_student_enrollment_status_trigger.sql`

The trigger maps `enrollment_status` → `sms_students.enrollment_status`:

```sql
v_student_status := CASE v_lifecycle_status
  WHEN 'active'           THEN 'enrolled'
  WHEN 'promoted'         THEN 'enrolled'
  WHEN 'retained'         THEN 'enrolled'
  WHEN 'completed'        THEN 'enrolled'
  WHEN 'graduated'        THEN 'graduated'
  WHEN 'transferred_out'  THEN 'transferred'
  WHEN 'pending_transfer' THEN 'transferred'
  WHEN 'dropped'          THEN 'dropped'
  ELSE 'enrolled'           -- <-- catches pending_review
END;
```

`pending_review` is not explicitly listed. It falls into the `ELSE 'enrolled'` branch, so students awaiting destination school review are shown as `'enrolled'` in `sms_students`. This is arguably acceptable as a temporary state, but it is misleading — a student in `pending_review` is not yet an active enrollee and could cause confusion in student portal lookups or division reports that rely on `sms_students.enrollment_status`.

**Recommendation:** Add `WHEN 'pending_review' THEN 'transferred'` (or a new status like `'pending_review'`) to make the mapping explicit.

### 2.4 TransferOutModal UI Text Contradicts System Behavior

**File:** `app/(protected)/teacher/components/TransferOutModal.tsx`, lines 272–278

The modal info box reads:

> "When the destination school enrolls this student via LRN lookup, **no record request will be needed**."

This is **incorrect**. Per the system design (CLAUDE.md and migration 057), ALL inter-school transfers — even students already marked `transferred_out` — go through the mandatory two-stage record request flow. The `enroll_student_with_record_request` RPC always creates a record request. There is no bypass path.

This is a documentation/UX bug that will confuse staff at origin schools.

### 2.5 `has_record_access` RLS Function — Correctness

**File:** `supabase/migrations/057_transfer_two_stage_approval.sql`, lines 222–234

The function correctly checks `record_access_granted = TRUE AND status = 'approved'` before granting cross-school read access. The index at line 39 supports this lookup efficiently.

RLS policies are applied to: `sms_grades`, `sms_attendance`, `sms_enrollments`, `sms_eccd_assessments`, `sms_learner_health`. This appears comprehensive. The `sms_learner_health` table is also covered (migration 057 line 289).

**No issues found.**

---

## 3. Promotion/Graduation Workflow Audit

### 3.1 Flow Correctness (PromoteStudentModal)

**File:** `app/(protected)/teacher/components/PromoteStudentModal.tsx`

The promotion action:
1. Sets `sms_enrollments.enrollment_status` to `'promoted'` (non-terminal) or `'graduated'` (terminal: grades 6, 10, 12).
2. For graduated: sets `sms_students.enrollment_status = 'graduated'`, clears `current_section_id`.
3. For promoted: increments `grade_level` on `sms_students`, clears `current_section_id`.

**Terminal grade detection:** `TERMINAL_GRADES = [6, 10, 12]` — Grade 6 (end of elementary), Grade 10 (end of JHS), Grade 12 (end of SHS). This matches DepEd structure.

**SNED/Kindergarten promotion:** `nextGradeLevel = gradeLevel <= 0 ? 1 : gradeLevel + 1` — both SNED (-1) and Kinder (0) promote to Grade 1. This is correct for DepEd.

### 3.2 Promoted Students and Section Assignment

**Answer to the core question: promoted students do NOT get assigned to a section during promotion. They must go through the Auto Enroll flow.**

The `PromoteStudentModal` explicitly clears `current_section_id = null` on the student record when promoted (lines 190–191). This is by design: promoted students are placed in a `promoted` enrollment status pool and staff must use the "Auto Enroll" modal (`EnrollExistingStudentsModal` → `EnrollStudentsTabContent`) to batch-assign them to sections for the next school year.

The `EnrollStudentsTabContent` component:
- Filters by `enrollment_status = 'promoted'` (or `'retained'`) to find eligible students.
- Requires a section assignment before enrolling.
- Creates a new enrollment record with `status = 'approved'`, `enrollment_status = 'active'`.
- Sets `sms_students.current_section_id` to the assigned section.
- For promoted students, also marks the old enrollment as `enrollment_status = 'completed'`.

**This is correct and intentional design.** A promoted student temporarily has no section until the new school year enrollment.

### 3.3 Promotion Deadline Enforcement

**File:** `app/(protected)/teacher/sections/[id]/page.tsx`, lines 103–106

The Promote/Graduate action menu item is disabled when `isPromotionOverdue` is true:

```tsx
disabled={isPromotionOverdue}
```

The deadline is checked as: `new Date(settings.promotion_deadline + "T23:59:59") < new Date()`.

This correctly uses end-of-day as the cutoff. However, the deadline only disables the promote button in the teacher's section view. Staff via the admin enrollment page have no equivalent guard — an admin could still manually edit an enrollment to `promoted` status without the deadline check.

### 3.4 Graduated Students: Dual Update Path

**File:** `app/(protected)/teacher/components/PromoteStudentModal.tsx`, lines 174–184

When graduating:
```ts
await supabase.from("sms_students").update({
  enrollment_status: "graduated",
  current_section_id: null,
}).eq("id", student.id);
```

The sync trigger (migration 056) will also fire because the `sms_enrollments` update occurs first (line 168), and it will set `sms_students.enrollment_status = 'graduated'`. So the explicit `sms_students.update` at line 174 is redundant but not harmful.

For promoted (non-terminal) students, the explicit update only sets `grade_level` and `current_section_id = null` — it does NOT set `enrollment_status`. The trigger handles `enrollment_status` via the `promoted → enrolled` mapping. This split responsibility is acceptable but fragile: if the trigger were ever disabled or removed, promoted students would retain stale `sms_students.enrollment_status` values.

### 3.5 RetainNlisModal — Missing Student Status Update for Retain Action

**File:** `app/(protected)/teacher/components/RetainNlisModal.tsx`, lines 71–78

For the "retain" action, only `sms_enrollments` is updated:
```ts
await supabase.from("sms_enrollments").update({
  enrollment_status: "retained",
  remarks: remarks.trim(),
}).eq("id", enrollmentId);
```

There is no explicit `sms_students` update. The sync trigger maps `retained → enrolled`, so `sms_students.enrollment_status` will be set to `'enrolled'` — which is correct. However, `sms_students.current_section_id` is NOT cleared. A retained student remains in their current section, which is correct behavior.

For the "nlis" (dropped) action, both `sms_enrollments` and `sms_students` are explicitly updated (lines 84–101). This inconsistency between retain and NLIS paths is not a bug (trigger covers retain), but it is an inconsistency in pattern.

---

## 4. Section Assignment for Promoted Students — Detail

The question "do promoted students ever get assigned to a section?" has two answers:

1. **Immediately upon promotion:** No. `current_section_id` is cleared to NULL.
2. **When enrolled for the next year:** Yes, via `EnrollExistingStudentsModal`. Staff must:
   - Select "Promoted" tab, choose grade level and target school year.
   - Select students and use "Auto Assign Sections" or manually assign.
   - Click "Mark as Enrolled".

This creates a new `sms_enrollments` row and updates `sms_students.current_section_id`.

**The `sections` query in `EnrollStudentsTabContent` (line 263–269) filters by `is_active = true`, `grade_level = targetGradeLevel`, `school_year = targetSchoolYear`.** This means sections must exist for the target school year before promoted students can be enrolled. If no sections exist yet, the modal shows a warning and blocks enrollment.

---

## 5. Enrollment Uniqueness Constraint

**File:** `supabase/migrations/039_fix_enrollment_unique_constraint.sql`

```sql
CREATE UNIQUE INDEX uq_enrollments_student_school_year_semester
  ON procurements.sms_enrollments (student_id, school_id, school_year, COALESCE(semester, 0));
```

This allows a student to have enrollments at different schools in the same school year (required for transfers). However, the `status` field is not included in the constraint. This means a student could have both a `pending` enrollment and an `approved` enrollment at the same school for the same year. In practice this is guarded by the application-level checks, but there is no DB-level constraint preventing it.

---

## 6. SQL Injection Risk (Low Severity)

**File:** `app/(protected)/teacher/components/TransferOutModal.tsx`, line 87

```ts
.ilike("name", `%${query.trim()}%`)
```

The school name search does not use `escapeIlikePattern()` from `@/lib/utils`. Special characters (`%`, `_`, `\`) in the search query would be treated as SQL wildcards, potentially returning unexpected results. This is a correctness issue (wrong results) and a minor security concern. The project convention requires `escapeIlikePattern()` for all user-supplied `ilike` strings (per CLAUDE.md).

---

## 7. Status Lifecycle Summary

| Status | Set By | Means |
|--------|--------|-------|
| `active` | Enrollment wizard, Auto Enroll, `review_transfer_enrollment` (approve) | Student currently enrolled |
| `completed` | `EnrollStudentsTabContent` (after promoted student re-enrolled) | Previous year enrollment closed |
| `transferred_out` | `TransferOutModal`, `respond_to_record_request` (approve) | Student left to another school |
| `dropped` | `RetainNlisModal` (NLIS action) | Student dropped/NLIS |
| `pending_transfer` | `enroll_student_with_record_request` (origin enrollment) | Awaiting origin school approval |
| `retained` | `RetainNlisModal` (retain action) | Student repeating same grade |
| `promoted` | `PromoteStudentModal` | Student promoted, awaiting new enrollment |
| `graduated` | `PromoteStudentModal` (terminal grades) | Student completed terminal grade |
| `pending_review` | `respond_to_record_request` (approve, destination enrollment) | Awaiting destination school review |

---

## 8. Findings Summary

### Confirmed Bugs

1. **TransferOutModal misleading UI text** — Tells staff that no record request will be needed when a transferred-out student is looked up by the destination school. This is false; all transfers still require the two-stage flow.
   - **File:** `app/(protected)/teacher/components/TransferOutModal.tsx:272–278`

2. **`pending_review` not mapped in sync trigger** — Falls through to `ELSE 'enrolled'`, silently treating students awaiting review as enrolled.
   - **File:** `supabase/migrations/056_sync_student_enrollment_status_trigger.sql:49–59`

3. **Migration 038 original RPC creates enrollment with wrong `enrollment_status`** — `'active'` instead of `'pending_transfer'` (corrected in 057, but historical data affected).
   - **File:** `supabase/migrations/038_multi_school_transfers.sql:244`

4. **Unescaped `ilike` in school search** — No `escapeIlikePattern()` used.
   - **File:** `app/(protected)/teacher/components/TransferOutModal.tsx:87`

### Design Decisions (Correct, Not Bugs)

- Promoted students always lose their section (`current_section_id = null`) and are re-assigned via Auto Enroll.
- The two-stage transfer approval (migration 057) is correctly implemented and mandatory for all inter-school transfers with no bypass path.
- Graduation correctly uses terminal grades [6, 10, 12] matching DepEd structure.
- SNED (-1) and Kindergarten (0) both promote to Grade 1.
- Retention keeps the student's section; NLIS (drop) clears it.
- The `EnrollStudentsTabContent` correctly marks old promoted enrollments as `completed` after re-enrollment but leaves retained enrollments at `retained` for historical accuracy.
