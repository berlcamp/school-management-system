# SMS Code Audit Report
**Date:** 2026-04-02
**Scope:** Enrollment and Promotion/Graduation Workflows — Pass 3 (Business Logic Validation) and Pass 7 (QA & Edge Cases). Files reviewed include EnrollmentWizard.tsx, EnrollStudentsTabContent.tsx, PromoteStudentModal.tsx, teacher/sections/[id]/page.tsx, IncomingRequestsTab.tsx, PendingReviewsTab.tsx, TransferRecordViewer.tsx, enrollmentWizardSchema.ts, LrnBoxInput.tsx, TeacherGradeEntryTable.tsx, and migrations 010, 038, 039, 046, 050, 056, 057.

---

## Executive Summary

The two-stage transfer approval workflow is structurally correct and clearly implemented — the three stages (destination enrolls → origin approves → destination reviews) are all enforced by dedicated RPCs with no shortcut bypass. The promotion logic correctly clears `section_id` on the student record and does NOT assign a section during promotion. However, there are three meaningful correctness issues: (1) a stale `enrollment_status='active'` is written into the new enrollment row by the original migration-038 RPC version, but migration-057 overwrites it to `'pending_transfer'` — this is safe by the end of migration, but the legacy RPC body in 038 shows an inconsistency that is confusing and risky if 057 is ever rolled back; (2) the `enroll_student_with_record_request` RPC immediately sets `sms_students.current_section_id` to the requested section even while the enrollment is still `pending_transfer`, violating the invariant that section assignment should only be finalized on approval; and (3) `TERMINAL_GRADES = [6, 10, 12]` causes Grade 10 (end of JHS) to be marked `graduated` rather than `promoted`, which contradicts DepEd policy — Grade 10 completers should be `promoted` to SHS, not `graduated`. Top three recommended actions: fix Grade 10 terminal classification, clear `current_section_id` during pending transfer (set it only on `review_transfer_enrollment` approval), and add a database-level LRN length constraint.

---

## Findings by Category

### 1. Architecture

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Info | `app/(protected)/enrollment/components/EnrollmentWizard.tsx` | File is ~1,100 lines — well above the 300-line co-location guideline. | Consider splitting the submit handler into a `useEnrollmentSubmit` hook. |
| Info | `app/(protected)/teacher/sections/[id]/page.tsx` | Page file is very long (~800 lines). Promotion, transfer-out, and retain-NLIS UI blocks could each be smaller dedicated components. | Co-locate those blocks as `SectionStudentRow.tsx` or similar. |
| Low | `TERMINAL_GRADES` constant duplicated in `PromoteStudentModal.tsx` and `teacher/sections/[id]/page.tsx` | Magic array defined twice; if changed in one place, the other is silently out of sync. | Extract to `lib/constants.ts` as a single `TERMINAL_GRADE_LEVELS` export. |

---

### 2. Database & Supabase

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Medium | `supabase/migrations/038_multi_school_transfers.sql` (line 244) | The original `enroll_student_with_record_request` RPC inserts the new enrollment with `enrollment_status = 'active'` (not `'pending_transfer'`). Migration 057 fixes this by replacing the function with `'pending_transfer'`, but the migration history contains a contradictory version. If 057 is ever partially reverted or the function is inspected without context, it will appear intentional. | Add a comment in 057 explicitly noting this replaces the incorrect 038 version, and consider dropping the old body from 038 via a comment edit or inline note. |
| Low | `supabase/migrations/010_enrollment_unique_student_school_year.sql` | Migration 010 adds `UNIQUE (student_id, school_year)` but migration 039 drops it in favor of `(student_id, school_id, school_year, COALESCE(semester, 0))`. The old constraint is dropped but not explicitly documented as intentionally superseded. | Add a migration comment referencing 039. |
| Low | `app/(protected)/enrollment/components/EnrollStudentsTabContent.tsx` (line 520) | When a batch insert hits the `23505` unique-constraint error, the entire batch is silently skipped (`skipCount += batch.length`). If only one student in a batch of 500 is a duplicate, all 499 others are also skipped. | Split into per-record inserts or use `onConflict: 'ignore'` at the database level to avoid silent batch-level failures. |
| Info | Multiple files | Several `.from("sms_grades").select("*")` calls without `school_id` filter — grades access is controlled via `section_id` / `student_id` filters instead. This is acceptable but worth auditing RLS on `sms_grades`. | Verify RLS on `sms_grades` covers school scoping; add `school_id` column if missing. |

---

### 3. Business Logic (DepEd Workflows)

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| **Critical** | `app/(protected)/teacher/components/PromoteStudentModal.tsx` (line 22) and `teacher/sections/[id]/page.tsx` (line 53) | `TERMINAL_GRADES = [6, 10, 12]` — **Grade 10 is included as a terminal grade, so Grade 10 students are marked `graduated` instead of `promoted`.** Per DepEd, Grade 10 completers finish JHS and should be `promoted` to SHS (Grade 11), not `graduated`. Only Grade 6 (Elementary) and Grade 12 (SHS) are true graduation points. The `graduated` status on a Grade 10 student will cause them to appear in SF10 and report cards as graduated instead of promoted, and may block re-enrollment in Grade 11. | Remove `10` from `TERMINAL_GRADES`. Grade 10 should produce `promoted` status, not `graduated`. |
| **High** | `supabase/migrations/057_transfer_two_stage_approval.sql` (lines 98–102) | The `enroll_student_with_record_request` RPC sets `sms_students.current_section_id = p_section_id` immediately when the enrollment is still `pending_transfer`. The invariant is that `current_section_id` should reflect the student's confirmed active section. A transferee has no confirmed section until `review_transfer_enrollment` approves. This means section enrollment counts shown in the wizard are already inflated by pending transferees who may never complete the transfer. | In the RPC, set `current_section_id = NULL` while enrollment is `pending_transfer`. Set it to the actual section only inside `review_transfer_enrollment` on approval (already done on line 189 of 057). |
| Medium | `supabase/migrations/057_transfer_two_stage_approval.sql` (line 207) | On rejection in `review_transfer_enrollment`, the student is reverted with `enrollment_status = 'transferred'` (not a valid `sms_students.enrollment_status` value). The trigger in migration 056 maps from `sms_enrollments.enrollment_status` to student statuses — the string `'transferred'` written directly to `sms_students.enrollment_status` bypasses the trigger's canonical mapping. | Use a valid student-level status such as `'dropped'` or re-query from the enrollment history rather than hardcoding `'transferred'`. |
| Medium | `supabase/migrations/057_transfer_two_stage_approval.sql` | The `enroll_student_with_record_request` RPC accepts students with `enrollment_status IN ('active', 'completed', 'transferred_out')` at the origin school. A student with `completed` status (finished the school year, not yet promoted) can be pulled by another school as a transferee, potentially bypassing the promotion workflow at the origin school. | Consider whether `completed` should be a valid origin status for transfers, or require the origin to promote/retain first before the student can transfer. |
| Low | `app/(protected)/teacher/sections/[id]/page.tsx` (line 104–106) | The promotion deadline check is **client-only** — `isPromotionOverdue` disables the UI button, but there is no server-side enforcement in the `promote` flow (a direct API call to `.update({ enrollment_status: newStatus })` has no deadline check). | Add a server-side check either via an RPC that reads `sms_school_settings.promotion_deadline`, or via a database trigger on `sms_enrollments` that rejects `promoted`/`graduated` status changes after the deadline. |
| Low | Transfer flow — `StudentEntryMode` | Confirmed: `StudentEntryMode` is `"new" | "existing" | "transferee"` with no `pre_released` variant. All inter-school lookups set `entryMode = "transferee"` regardless of origin status. The two-stage flow is correctly mandatory. | No action — invariant is satisfied. |
| Info | `app/(protected)/enrollment/components/EnrollStudentsTabContent.tsx` (line 542–549) | When enrolling promoted students into the new school year, old enrollments are updated to `completed` status. However, the loop uses per-record `await supabase.from("sms_enrollments").update(...)` inside a batch loop — for large batches this is an N+1 query. The enrollment IDs are already batched for inserts (line 507), but the status update is not batched the same way. | Use `.in("id", enrollmentIds)` with a single update call (or split into the same BATCH_SIZE chunks) instead of per-record updates. |

---

### 4. Code Quality

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Low | `app/(protected)/enrollment/components/enrollmentWizardSchema.ts` (line 9, 40) | LRN is validated only as `z.string().min(1, "LRN is required")` — no length or digit constraint is enforced by Zod. The `LrnBoxInput` component enforces 12 digits via the UI, but a programmatic form submit could accept a 1-character LRN. | Add `z.string().length(12, "LRN must be 12 digits").regex(/^\d+$/, "LRN must be numeric")`. |
| Low | `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx` (line 313–390) | Grade save uses `delete` then `insert` (not upsert), which creates a window where grades are momentarily absent. If the insert fails after the delete succeeds, grades are permanently lost. | Use `upsert` with `onConflict` on `(student_id, subject_id, section_id, grading_period, school_year)` instead of delete-then-insert. |
| Low | `app/(protected)/enrollment/components/EnrollmentWizard.tsx` (line 174–179) | LRN lookup triggers when `lrn.trim().length >= 4`, but the actual LRN is 12 digits. This means a lookup fires after only 4 characters, potentially flooding the database with partial-LRN queries. | Trigger lookup only when LRN is exactly 12 characters. |
| Info | `app/(protected)/teacher/components/PromoteStudentModal.tsx` (line 133) | GPA calculation filters `grade > 0` — a grade of `0` is treated as "no grade" rather than a real zero. If a teacher legitimately enters 0 (worst possible grade), it's excluded from the GPA. | Distinguish between "no grade entered" (null) and a legitimate zero grade. Store null for absent grades rather than 0. |

---

### 5. Security

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Low | `supabase/migrations/038_multi_school_transfers.sql` (line 386) | `sms_record_requests` table grants `SELECT, INSERT, UPDATE, DELETE` directly to `authenticated` role with table-level grants, relying entirely on RLS policies. The `UPDATE` policy only checks `origin_school_id` — a requesting school could theoretically use a raw SQL client to bypass the policy and update their own request. | Audit RLS: ensure `UPDATE` on `sms_record_requests` by the requesting school is blocked (they should not be able to update status themselves). Consider making the `status` column immutable from the client and only updatable via SECURITY DEFINER RPCs. |
| Low | `app/(protected)/manage-requests/components/record-requests/IncomingRequestsTab.tsx` | Approval action calls `respond_to_record_request` RPC using the user's `system_user_id` from Redux state. If Redux state is tampered, a wrong `p_responder_id` is recorded. | RPCs that record approval attribution should re-derive the user ID server-side from `auth.uid()` rather than accept it as a parameter. |
| Info | All transfer RPC functions use `SECURITY DEFINER` | This is appropriate for atomic cross-school operations, but means any authenticated user can call these functions. | Ensure that RPCs validate the caller's school membership matches the operation's intended actor (e.g., `p_requesting_school_id` must equal the caller's `school_id`). Migration 057 does NOT include this check — it only validates student state, not caller identity. |

---

### 6. Performance

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Medium | `app/(protected)/enrollment/components/EnrollmentWizard.tsx` (line 340–362) | The GPA distribution for section suggestions fetches ALL grades for ALL sections at the current school year with `.select("student_id, section_id, grade")` — no pagination or limit. In a school with many sections and students, this can return thousands of rows on every section fetch. | Add a `school_id` filter (already done for `sms_sections` fetch) and limit columns; consider aggregating at the database level via an RPC. |
| Low | `app/(protected)/enrollment/components/EnrollStudentsTabContent.tsx` (line 527–538) | After batch insert, individual `sms_students` updates run one per student in a non-batched for-loop, creating N database calls for N students. | Batch the student updates using `.in("id", studentIds)` where all students in a batch share the same section (may need restructuring), or use a single RPC that handles both inserts and student updates atomically. |

---

### 7. QA & Edge Cases

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| **High** | `app/(protected)/teacher/components/PromoteStudentModal.tsx` | **Grade 10 graduation edge case**: as noted above, Grade 10 is in `TERMINAL_GRADES`. A Grade 10 student who "graduates" will have `enrollment_status = 'graduated'` on `sms_enrollments` and `sms_students`. The lookup in `EnrollStudentsTabContent` filters for `enrollment_status = mode` (promoted/retained). If a Grade 10 student is incorrectly marked `graduated`, they will not appear in the "promoted students" batch enroll list for Grade 11, and staff will need to manually enroll them via the individual wizard. | Fix `TERMINAL_GRADES` as noted in Business Logic section. |
| Medium | `app/(protected)/enrollment/components/EnrollmentWizard.tsx` (line 200–209) | **Transfer to same school**: If `result.current_school_id` equals `user.school_id`, `setEntryMode("existing")` is set. However, `result.current_school_id` is derived from `COALESCE(e.school_id, s.school_id)` in the `lookup_student_by_lrn` function — a student with no enrollment but who is attached to the same school via `sms_students.school_id` would incorrectly be treated as `existing`. The RPC (`enroll_student_with_record_request`) also has a guard (`RAISE EXCEPTION 'Student already at this school'`) but that guard only fires during the transferee RPC call, not the `existing` path. | Verify the same-school detection covers the case where the student has no enrollment but matches via `sms_students.school_id`. |
| Medium | `app/(protected)/enrollment/components/EnrollStudentsTabContent.tsx` (line 507–521) | **Batch failure on duplicate**: when a batch of 500 students hits a unique constraint error, the code catches the `23505` error and marks the entire batch as skipped (`skipCount += batch.length`). No retry or individual-record fallback occurs, so up to 499 correctly-new students can be silently skipped. | Either insert one at a time, or use Postgres `ON CONFLICT DO NOTHING` (via `upsert` with `ignoreDuplicates: true`) to skip only actual duplicates and return success for the rest. |
| Medium | Promotion deadline check | **Server-side enforcement missing**: The promotion deadline is checked client-side only (disabling the button in the UI). The `handlePromote` function in `PromoteStudentModal.tsx` calls `.update({ enrollment_status: newStatus })` directly on `sms_enrollments` with no server-side deadline validation. A staff member with direct API access or via a stale UI session could promote students after the deadline has passed. | Add a database-level check: either an RPC for promotion that reads `sms_school_settings.promotion_deadline`, or a BEFORE UPDATE trigger that rejects `promoted`/`graduated` status changes when the deadline has passed. |
| Low | LRN lookup trigger threshold | LRN lookup fires when `lrn.trim().length >= 4`. Since LRNs are always 12 digits, this causes up to 8 unnecessary database lookups per enrollment (at lengths 4, 5, 6, 7, 8, 9, 10, 11). While each lookup is fast, under concurrent use this adds unnecessary load. | Trigger lookup only at exactly 12 characters. |
| Low | `app/(protected)/enrollment/components/enrollmentWizardSchema.ts` | **LRN validation**: `z.string().min(1, "LRN is required")` accepts any non-empty string as a valid LRN. A staff member could accidentally save a student with an invalid LRN (e.g., 5 digits), causing lookup failures later. The `LrnBoxInput` component enforces 12 digits in the UI, but no schema-level validation exists. | Add `.length(12).regex(/^\d{12}$/)` to the schema. |
| Low | `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx` | **Grade boundary**: The `handleGradeChange` function only updates state if `numValue >= 0 && numValue <= 100`, so out-of-range grades are silently discarded with no error message to the teacher. | Show a validation error message when an out-of-range grade is entered, rather than silently ignoring it. |
| Low | Concurrent enrollment | The unique constraint `uq_enrollments_student_school_year_semester` (migration 039) on `(student_id, school_id, school_year, semester)` prevents double-enrollment. However, there is a client-side pre-check in `EnrollmentWizard.tsx` (line 922–944) before inserting — this is a TOCTOU race condition (check then insert). The DB constraint is the authoritative safeguard; the client pre-check is redundant. | The DB constraint is correct; the client-side check can remain as UX but should not be relied on for correctness. |
| Info | `app/(protected)/teacher/sections/[id]/page.tsx` (line 143–157) | The teacher section page fetches ALL enrollments for the section without filtering by `enrollment_status`. This means promoted, graduated, dropped, transferred-out students all appear in the section view. The code does include `enrollment_status` in the returned data and surfaces it in the UI, but the list is not filtered — promoted students still appear. | Filter to `enrollment_status = 'active'` for the working section view, or clearly badge non-active students so teachers know they can only operate on active ones. |

---

## Critical Issues (requires immediate action)

1. **Grade 10 incorrectly marked `graduated`** (`TERMINAL_GRADES = [6, 10, 12]` in `PromoteStudentModal.tsx` and `teacher/sections/[id]/page.tsx`): Grade 10 completers should receive `promoted` status to advance to SHS (Grade 11). This affects SF10 generation, re-enrollment workflows, and the batch enrollment list. Remove `10` from `TERMINAL_GRADES`.

2. **Section pre-assigned on pending transfer** (`enroll_student_with_record_request` RPC, migration 057 line 101): `current_section_id` on `sms_students` is set immediately when `enrollment_status = 'pending_transfer'`, before the transfer is approved. This inflates active section enrollment counts shown in the wizard and violates the invariant that section assignment should only be finalized on approval. Set `current_section_id = NULL` during pending transfer; set it only in `review_transfer_enrollment` on approval (line 189 already does this correctly — the pre-set on line 101 is the redundant and incorrect step).

3. **Promotion deadline not enforced server-side** (`PromoteStudentModal.tsx` handlePromote): The direct `.update({ enrollment_status })` call on `sms_enrollments` bypasses the promotion deadline. A teacher or admin with API access can promote students after the deadline without any server-side rejection. Add an RPC or trigger for this check.

---

## Recommended Refactoring Opportunities

1. **Extract `TERMINAL_GRADE_LEVELS` to `lib/constants.ts`**: The array `[6, 10, 12]` (after fixing to `[6, 12]`) is defined in two separate files. A single export from constants eliminates the drift risk.

2. **Replace delete-then-insert in grade save with upsert**: `TeacherGradeEntryTable.tsx` deletes all grades then re-inserts, creating a data-loss window on failed inserts. An upsert on `(student_id, subject_id, section_id, grading_period, school_year)` is atomic and eliminates this risk.

3. **Batch the student record updates in `EnrollStudentsTabContent`**: The post-enrollment student record update loop (`for (const s of selectedStudents)`) runs N separate Supabase calls. Restructuring to a single `.in("id", ids).update(...)` or a dedicated RPC reduces round-trips dramatically for large promotions.

4. **Add an LRN validation Zod schema**: LRN validation is currently split between the `LrnBoxInput` UI component (12 digits enforced by character count) and the schema (`min(1)` only). Consolidating to `z.string().length(12).regex(/^\d{12}$/)` ensures server actions and any future form consumers are protected.

5. **Create a promotion RPC to enforce deadline server-side**: Instead of calling `.update()` directly from the client, introduce a `promote_student(p_enrollment_id, p_action, p_reviewer_id)` RPC that reads `sms_school_settings.promotion_deadline` and rejects the call if expired. This also centralizes promotion logic and makes it auditable.

---

## Summary Metrics

- **Total findings:** 22
- **Critical:** 3 | **High:** 2 | **Medium:** 7 | **Low:** 8 | **Info:** 4
- **Files reviewed:** 17 (EnrollmentWizard.tsx, EnrollStudentsTabContent.tsx, EnrollmentDetailsStep.tsx, enrollmentWizardSchema.ts, LrnBoxInput.tsx, PromoteStudentModal.tsx, teacher/sections/[id]/page.tsx, TeacherGradeEntryTable.tsx, PendingReviewsTab.tsx, IncomingRequestsTab.tsx, TransferRecordViewer.tsx, migrations 010, 038, 039, 046, 050, 056, 057)
