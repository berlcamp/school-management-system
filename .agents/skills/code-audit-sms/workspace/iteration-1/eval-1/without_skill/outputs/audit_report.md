# Security Audit Report — School Management System (SMS)

**Date:** 2026-04-02
**Scope:** `/Users/berltreasurecampomanes/Documents/Github Builds/school-management`
**Framework:** Next.js 16 (App Router) + Supabase (PostgreSQL + Auth)
**Auditor:** Claude Sonnet 4.6 (baseline, no skill guidance)

---

## Executive Summary

The SMS codebase has a well-structured authentication framework and meaningful security controls in several areas. However, a **critical vulnerability** exists in the naming of the service role key environment variable, which exposes the key to browser JavaScript. Additionally, **Supabase Row-Level Security (RLS) policies on most tables are not school-scoped**, meaning any authenticated user from any school can read (and sometimes write) data belonging to other schools. Several other findings of medium and low severity are documented below.

---

## Findings

### CRITICAL: Service Role Key Exposed to Browser via NEXT_PUBLIC_ Prefix

**File:** `lib/supabase/admin.ts`, `.env.local`

```
NEXT_PUBLIC_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1N...  ← in .env.local
```

```ts
// lib/supabase/admin.ts
process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY ?? ""
```

The Supabase service role key is stored in an environment variable prefixed with `NEXT_PUBLIC_`. In Next.js, any variable beginning with `NEXT_PUBLIC_` is **inlined into client-side JavaScript bundles** and sent to the browser. The service role key bypasses all Supabase Row-Level Security and grants unrestricted database access.

`admin.ts` itself is only imported from server-side modules (`lib/student-portal/actions.ts`, `lib/requests/actions.ts`) — both are `"use server"` files. However, the key is still bundled into the client at build time because of the `NEXT_PUBLIC_` prefix, making it readable by anyone who inspects the JavaScript bundle delivered to their browser.

**Impact:** Full RLS bypass. Anyone who retrieves the key from the browser bundle can read, write, and delete all data in the database without restriction.

**Remediation:** Rename the environment variable to `SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix). Update `lib/supabase/admin.ts` to use `process.env.SERVICE_ROLE_KEY`. Rotate the Supabase service role key in the Supabase dashboard immediately.

---

### HIGH: RLS Policies on Most Tables Are Not School-Scoped

**Files:** `supabase/migrations/001_school_management_schema.sql`, `019_sms_attendance.sql`, `023_sms_learner_health.sql`, `031_librarian_and_book_allocations.sql`, `054_evaluations.sql`, `011_division_admin_schema.sql`

The RLS policies on the majority of tables only check `auth.role() = 'authenticated'` with no `school_id` filter. Affected tables include:

- `sms_students` — any staff member can read all students from all schools
- `sms_grades` — any authenticated user can read all grades from all schools
- `sms_attendance` — any authenticated user can read all attendance records
- `sms_learner_health` — any authenticated user can read all health records
- `sms_sections` — any authenticated user can read/modify sections from other schools
- `sms_enrollments` (base policies) — any authenticated user can read/modify enrollments
- `sms_book_allocations` — any authenticated user can read all book allocation data
- `sms_evaluations`, `sms_evaluation_questions`, `sms_evaluation_responses` — any authenticated user can read evaluations from any school
- `sms_schools` — any authenticated user can insert/update/delete school records

**Example (from migration 019):**
```sql
CREATE POLICY "Attendance is viewable by authenticated users"
  ON procurements.sms_attendance FOR SELECT
  USING (auth.role() = 'authenticated');
```

The application enforces school scoping at the **application layer** (by filtering `.eq("school_id", user.school_id)` in client-side code), but this is not enforced by the database. A teacher from School A can craft a direct API call to Supabase and read students, grades, or attendance records from School B.

Only two areas have proper database-level school scoping:
- `sms_subjects` and `sms_subject_schedules` (migration 037, then relaxed by 041 — see below)
- `sms_record_requests` (migration 038)

**Impact:** Cross-school data leakage. A teacher or any authenticated staff member at one school can access PII, grades, health records, and attendance data for students at every other school in the division.

**Remediation:** Add `school_id`-based conditions to all RLS policies, joining against `sms_users` to resolve the authenticated user's school:
```sql
USING (
  auth.role() = 'authenticated'
  AND school_id = (
    SELECT school_id FROM procurements.sms_users
    WHERE user_id = auth.uid() LIMIT 1
  )
)
```
For `division_admin`, add an OR branch to allow full access. This approach is already used correctly for `sms_record_requests`.

---

### HIGH: sms_subjects and sms_subject_schedules SELECT Policy Deliberately Relaxed (School Isolation Removed)

**File:** `supabase/migrations/041_fix_subjects_select_rls.sql`

Migration 037 added proper school-scoped SELECT policies for subjects and schedules. Migration 041 then **explicitly removed** this scoping and reverted to a simple `auth.role() = 'authenticated'` check, with the justification that "the app already filters by school_id client-side."

```sql
-- Migration 041 comment:
-- Fix: match the sms_sections pattern — any authenticated user can SELECT.
-- The app already filters by school_id client-side. Write policies remain role-restricted.
```

This intentionally leaves cross-school read access open at the database level.

**Impact:** Any authenticated user can enumerate all subjects and schedules across all schools in the division.

**Remediation:** Restore the school-scoped SELECT policies from migration 037 and fix the underlying UID linking issue that prompted migration 041 (ensure `sms_users.user_id` is always populated on first login, which `AuthGuard` already attempts to do).

---

### HIGH: Public RLS Policies on sms_requests Allow Unrestricted Access

**File:** `supabase/migrations/049_requests_rebuild.sql`

The document request table (`sms_requests`) and its related tables have fully permissive RLS policies:

```sql
CREATE POLICY "sms_requests_public_read"
  ON procurements.sms_requests FOR SELECT
  TO anon, authenticated
  USING (true);  -- ← no filter whatsoever

CREATE POLICY "sms_request_attachments_all"
  ON procurements.sms_request_attachments FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "sms_request_logs_all"
  ON procurements.sms_request_logs FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
```

Anonymous (unauthenticated) users can read ALL document requests across ALL schools, including requester PII (name, contact, relationship), student names, and LRNs. Anonymous users can also insert and modify audit log entries.

The `trackRequest` server action applies business logic limits, but the underlying Supabase API remains accessible directly.

**Impact:** An unauthenticated attacker who knows the Supabase URL and anon key (which is public) can enumerate every document request in the system, including contact information and student LRNs. Audit trails can be poisoned.

**Remediation:** Restrict `sms_requests` SELECT to authenticated users, filter by `school_id`. For public tracking by tracking number, consider a server-only endpoint rather than direct table access. Remove `anon` from INSERT/UPDATE policies for logs and attachments.

---

### HIGH: sms_students Fully Readable by Anonymous Users

**File:** `supabase/migrations/015_public_landing_read_access.sql`

```sql
CREATE POLICY "Students are viewable by anon for public landing"
  ON procurements.sms_students FOR SELECT
  TO anon
  USING (true);  -- ← unrestricted
```

This policy was added to support a public landing page that shows aggregate enrollment statistics. The `USING (true)` clause exposes all student records — including names, LRNs, dates of birth, contact numbers, parent/guardian information, and more — to the anonymous role with no restrictions.

Combined with the fact that `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by design, **any person with internet access can query the full student table** via Supabase REST API.

**Impact:** Complete exposure of all student PII to the public internet. This includes minors' names, dates of birth (authentication factors for the student portal), LRNs, and guardian contact information.

**Remediation:** Replace the permissive `USING (true)` with a restrictive policy. For the landing page, use a `SECURITY DEFINER` function that returns only aggregate counts, not raw student records. The anon role should never have access to `sms_students`.

---

### MEDIUM: Student Portal studentId Is Trusted Directly From JWT, Not Re-Validated

**File:** `lib/student-portal/actions.ts`

The `getStudentGrades` function accepts a `studentId` parameter and queries the database directly with it using the service role key (bypasses RLS):

```ts
export async function getStudentGrades(studentId: string): Promise<SchoolYearGrades[]> {
  const { data: grades } = await supabase2
    .from("sms_grades")
    .select("subject_id, school_year, grading_period, grade")
    .eq("student_id", studentId);
```

The caller in `app/student-portal/(portal)/grades/page.tsx` passes `session.studentId` from the client-side session context. The session is read via `getStudentSession()` on the server, which verifies the JWT cookie — so the `studentId` is taken from a verified JWT, not from raw user input.

However, the server actions themselves do not re-verify the session. If a server action is called directly (e.g., via a crafted POST), the `studentId` argument could be any value. The functions lack session re-validation at the action boundary.

**Impact:** If a student can call server actions directly with arbitrary `studentId` values, they could access another student's grades. In the current UI this is not possible, but the absence of session checks in server actions is a defensive programming gap.

**Remediation:** Each server action in `lib/student-portal/actions.ts` should call `getStudentSession()` internally and verify that the requested `studentId` matches `session.studentId`, rather than trusting the caller-supplied parameter.

---

### MEDIUM: Client-Side Auth Guards (AuthGuard, DivisionGuard) Are Bypassable

**Files:** `components/AuthGuard.tsx`, `components/DivisionGuard.tsx`, `components/SchoolIdGuard.tsx`

All access control for the staff application is implemented as client-side React components. `AuthGuard` checks the Supabase session in `useEffect`, `DivisionGuard` checks `user.type === "division_admin"` from Redux state, and `SchoolIdGuard` checks `user.school_id` from Redux state.

These guards prevent unauthorized UI rendering but do **not** protect the underlying data. Since all data queries use the client-side Supabase client (with the anon key + user JWT), the RLS policies are the true enforcement layer. As noted above, most RLS policies only check `auth.role() = 'authenticated'` and not role or school.

A staff user at School A who understands the Supabase API can query any table directly by sending authenticated requests without going through the UI.

**Impact:** Role-based access controls (e.g., preventing a `teacher` from updating enrollment, or a `librarian` from accessing staff records) exist only in the UI, not the database.

**Remediation:** Role and school checks must be encoded in RLS policies, not only in client-side guards.

---

### MEDIUM: updateRequestStatus Server Action Has No Authorization Check

**File:** `lib/requests/actions.ts` — `updateRequestStatus` function

```ts
export async function updateRequestStatus(
  requestId: string,
  newStatus: RequestStatus,
  data: { reason?: string; userId: number; userName: string }
): Promise<...> {
  // No check: is the caller's userId actually the authenticated user?
  // No check: does the caller's school match the request's school_id?
```

This server action updates document request statuses (approve, reject, complete). It uses the service role key (`supabase2`) which bypasses RLS. The `userId` and `userName` are passed by the calling client component — not derived from the server-side session.

A malicious client could pass any `userId` and `userName`, allowing them to impersonate another staff member when approving or rejecting requests. There is also no check that the request belongs to the caller's school.

**Impact:** Any authenticated user can approve or reject document requests from any school, with any actor name in the audit log.

**Remediation:** Derive `userId` and `userName` server-side from the Supabase session (using the server client), not from client-supplied parameters. Add a `school_id` check to confirm the request belongs to the user's school.

---

### MEDIUM: ilike Search in TransferOutModal Not Escaped

**File:** `app/(protected)/teacher/components/TransferOutModal.tsx` line 87

```ts
.ilike("name", `%${query.trim()}%`)
```

Unlike other search fields in the codebase (which correctly use `escapeIlikePattern()`), the school name search in `TransferOutModal` does not escape `%` and `_` characters. This allows SQL wildcard injection where a user who types `%` can return all schools, and patterns like `_____` can be used to probe school names by length.

**Impact:** Low severity in isolation (no data modification), but it violates the established security convention (`escapeIlikePattern` is used in 12 other places) and could be exploited to enumerate all school names.

**Remediation:** Wrap `query.trim()` with `escapeIlikePattern()`.

---

### LOW: .env.local Not in .gitignore Root Pattern (Relies on Broad Glob)

**File:** `.gitignore`

```
.env*
```

The `.gitignore` uses `.env*` which matches `.env.local`. This is correct, and the service role key is not committed to git history based on current state. However, the broad glob means that if someone creates `.env.backup` or `.env.production.local` those would also be excluded, which is good. No issue found beyond the naming concern noted in the CRITICAL finding.

---

### LOW: anon Role Has SELECT on sms_students via migration 005

**File:** `supabase/migrations/005_grant_permissions.sql`

```sql
GRANT SELECT ON procurements.sms_students TO anon, authenticated;
```

This explicit GRANT predates and reinforces the policy-level exposure noted above. Even if the policy in migration 015 were fixed, this GRANT would need to be revoked for `anon` as well.

**Remediation:** `REVOKE SELECT ON procurements.sms_students FROM anon;`

---

### LOW: Form 137 Legacy Table (sms_form137_requests) Has Permissive Policies

**File:** `supabase/migrations/001_school_management_schema.sql`

```sql
CREATE POLICY "Form 137 requests are viewable by authenticated users"
  ON procurements.sms_form137_requests FOR SELECT
  USING (auth.role() = 'authenticated' OR true);  -- the OR true makes this fully public
```

`USING (auth.role() = 'authenticated' OR true)` is logically equivalent to `USING (true)` — it allows all users including anonymous to read all legacy Form 137 requests. This table is deprecated but not dropped.

**Remediation:** Drop the deprecated `sms_form137_requests` table or at minimum tighten its RLS policies.

---

### LOW: Missing Rate Limiting on Student Portal Login

**File:** `lib/student-portal/actions.ts` — `verifyStudent`

The student portal authenticates students by LRN + date of birth. There is no rate limiting, CAPTCHA, or account lockout on failed authentication attempts. An attacker who knows a student's LRN (which may be semi-public) could brute-force their date of birth (a small search space).

**Remediation:** Implement rate limiting (e.g., via Next.js middleware or an edge function) on the `/student-portal` login endpoint.

---

## Summary Table

| # | Severity | Finding |
|---|----------|---------|
| 1 | CRITICAL | Service role key exposed via NEXT_PUBLIC_ prefix |
| 2 | HIGH | RLS not school-scoped on most tables |
| 3 | HIGH | sms_subjects/schedules SELECT isolation deliberately removed |
| 4 | HIGH | sms_requests and logs fully readable/writable by anon |
| 5 | HIGH | sms_students fully readable by anonymous users |
| 6 | MEDIUM | Student portal server actions don't re-verify session |
| 7 | MEDIUM | Client-side guards bypassable; no DB-level role enforcement |
| 8 | MEDIUM | updateRequestStatus has no authorization check |
| 9 | MEDIUM | ilike search unescaped in TransferOutModal |
| 10 | LOW | anon GRANT on sms_students not revoked |
| 11 | LOW | Legacy sms_form137_requests has USING (true) policy |
| 12 | LOW | No rate limiting on student portal login |

---

## Positive Observations

- `.env*` is correctly excluded from git via `.gitignore`; the service role key is not committed to version history.
- The `admin.ts` client (`supabase2`) is **only imported in `"use server"` files**, so at the code level the service role is not called from client components — the naming is the vulnerability, not a direct client-side import.
- The student portal uses proper server-side JWT verification (`jose`) with `httpOnly` cookies for authentication — no client-accessible tokens.
- `escapeIlikePattern()` is used consistently in 12 of 13 ilike search locations.
- The two-stage transfer approval workflow correctly uses a `SECURITY DEFINER` helper function (`has_record_access`) to control cross-school data access.
- The `sms_record_requests` RLS policies are properly school-scoped and role-aware — the best example of correct RLS design in the codebase.
- Division admin separation is enforced both in `DivisionGuard` (UI) and in `sms_record_requests` RLS policies.
- Audit logging for document requests is implemented via `sms_request_logs`.
- `getCurrentSchoolYear()` and `escapeIlikePattern()` are centralized utilities, showing awareness of common security pitfalls.

---

## Prioritized Remediation Plan

1. **Immediately:** Rename `NEXT_PUBLIC_SERVICE_ROLE_KEY` → `SERVICE_ROLE_KEY` and rotate the Supabase service role key.
2. **Short-term:** Restrict `sms_students` SELECT policy for `anon` — remove the `USING (true)` clause and revoke the anon GRANT.
3. **Short-term:** Tighten `sms_requests` / `sms_request_attachments` / `sms_request_logs` policies: remove `anon` write access, restrict reads to authenticated + school-scoped.
4. **Medium-term:** Add school-scoped RLS policies to all tables (grades, attendance, health, enrollments, sections, evaluations, books). Pattern from `sms_record_requests` RLS (migration 038) is the right model.
5. **Medium-term:** Add session re-validation to all student portal server actions.
6. **Medium-term:** Add server-side authorization to `updateRequestStatus` — derive identity from session, not caller-supplied parameters.
7. **Long-term:** Restore school-scoped SELECT policies for `sms_subjects` and `sms_subject_schedules`; fix the underlying UID linking issue properly.
8. **Long-term:** Implement rate limiting on the student portal login endpoint.
9. **Cleanup:** Drop or properly secure the deprecated `sms_form137_requests` table.
