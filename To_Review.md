# SMS Code Review Plan

## 1. Security Audit
- **School data isolation:** Verify all queries filter by `school_id` for school-level roles. Check if teachers, registrars, or librarians can access other schools' data through missing filters.
- **Service role key exposure:** Confirm `NEXT_PUBLIC_SERVICE_ROLE_KEY` is not leaked to the client bundle or used where the anon key would suffice. Audit all usages of the admin Supabase client.
- **RLS policy coverage:** Review Row-Level Security policies on all `sms_*` tables — are there tables missing RLS or using overly permissive policies?
- **SQL injection:** Verify `escapeIlikePattern()` is used consistently on all user-supplied `ilike` inputs. Check for raw string interpolation in queries.
- **Student portal auth:** Audit JWT cookie handling — token expiry, secret strength, cookie flags (httpOnly, secure, sameSite). Ensure students cannot escalate to staff actions.
- **Role enforcement:** Verify `AuthGuard`, `SchoolIdGuard`, and sidebar filtering actually prevent unauthorized access to routes (not just UI hiding).
- **API route protection:** Check that any API routes or server actions validate the caller's role before executing.

## 2. Enrollment & Transfer Workflow Audit
- **Two-stage transfer approval:** Trace the full flow from LRN lookup → `enroll_student_with_record_request` → origin approval → `review_transfer_enrollment`. Verify no bypass paths exist.
- **Enrollment status transitions:** Validate that status changes follow the correct lifecycle (`active` → `promoted`/`graduated`/`transferred_out`/`dropped`/`retained`). Check for impossible transitions.
- **Promotion/graduation logic:** Verify promoted students are correctly moved to the next grade level. Check if section assignment happens automatically or is left dangling.
- **Record access grants:** Confirm `has_record_access()` correctly gates cross-school data visibility and that access is revoked on rejection.
- **Duplicate enrollment prevention:** Can a student be enrolled twice in the same school year? Check unique constraints and application-level guards.
- **Edge cases:** What happens if a transferee's origin school never responds? Can a student be transferred out while having active grades in the current period?

## 3. Code Quality & Performance Audit
- **TypeScript strictness:** Find all `any` types, untyped function parameters, and missing return types.
- **N+1 queries:** Identify list pages or components that fetch related data inside loops instead of batching (e.g., fetching student details one-by-one in a section list).
- **Missing `school_id` filters:** Scan all `.from("sms_*")` calls for queries that omit `school_id` where it should be present.
- **Redux `listSlice` misuse:** Check for stale cache issues — are filters properly resetting the list? Are there race conditions with `isMounted` flags?
- **Unmounted setState:** Verify `isMounted` cleanup is consistently applied across all data-fetching hooks and components.
- **Error handling:** Are Supabase query errors silently swallowed? Check for missing `.error` checks after `.from()` calls.
- **Bundle size concerns:** Look for large imports that could be lazy-loaded (PDF generation, Excel export libraries).

## 4. DepEd Reports & PDF Generation Audit
- **Data accuracy:** Verify SF1-SF10 reports pull correct data — enrollment counts, attendance tallies, grade computations match DepEd specifications.
- **PDF output correctness:** Check that generated PDFs handle edge cases — long names, missing data, special characters, large class sizes.
- **School year/section filtering:** Ensure reports respect the selected school year and section filters without data leakage from other periods.
- **Performance:** PDF generation for large datasets (full school SF1) — does it block the UI? Should it be offloaded?

## 5. Grade Entry & Report Card Audit
- **Grade validation rules:** Verify the 4 grading periods are enforced, grades are within valid ranges, and only authorized teachers can enter grades.
- **Schedule/adviser check:** Confirm `sms_subject_schedules` lookup correctly gates grade entry — no bypasses through direct API calls.
- **Report card generation:** Validate GPA/average calculations, core value ratings, and principal signatory data are correctly populated.
- **Historical grades (SF10):** Check that SF10 historical encoding correctly handles transferred students and multi-year records.

## 6. Books Module Audit
- **Allocation flow:** Manager → teacher allocation, teacher → student issuance. Verify inventory counts stay consistent (no negative stock, no double-issuance).
- **Return codes:** Confirm only valid return codes (`FM`, `TDO`, `NEG`) are accepted. Check for missing validation.
- **Cross-role access:** Can a teacher see or modify another teacher's book allocations?

## 7. Attendance & Learner Health Audit
- **SF2 attendance:** Verify AM/PM attendance tracking matches DepEd SF2 format. Check for date range validation and duplicate entry prevention.
- **Nutritional status calculations:** Confirm height/weight → BMI → nutritional status mapping follows DepEd SF8 standards.
- **Data completeness:** Are there required fields that can be submitted as null/empty?

## 8. Division Admin & Multi-School Audit
- **Division-level queries:** Verify division admins can access all schools but cannot modify individual school data inappropriately.
- **User management:** Check that division admins creating/editing users cannot assign invalid role + school combinations.
- **Cross-school reporting:** Ensure division-level reports aggregate correctly without double-counting shared students (transferees).

## 9. Settings & Configuration Audit
- **Record edit locks:** Verify that locking previous school year records actually prevents edits across all modules (grades, attendance, enrollment).
- **Promotion deadline:** Check enforcement — can staff promote/graduate students after the deadline?
- **Principal config:** Ensure settings changes propagate correctly to report cards and PDF outputs.

## 10. Student Portal Audit
- **Read-only enforcement:** Verify students cannot modify any data through the portal — no write endpoints accessible via student JWT.
- **Data scoping:** Confirm students only see their own grades, evaluations, and dashboard data — not other students'.
- **Session management:** Check JWT expiry handling, logout flow, and protection against token reuse.
