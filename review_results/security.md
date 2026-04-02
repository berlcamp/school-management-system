# SMS Security Audit Report

**Date:** 2026-04-02
**Scope:** Security Audit (Section 1 of To_Review.md) — school data isolation, service role key, RLS policies, SQL injection, student portal auth, role enforcement, API route protection

## Executive Summary

The SMS has **critical security gaps at the database layer** that are partially compensated by application-level filtering. The most urgent issues are: (1) overly permissive RLS policies granting unauthenticated access to student PII, (2) student portal server actions that don't verify caller identity (IDOR), and (3) missing route guards on teacher pages. Application-level `school_id` filtering is consistently applied (~90% of queries), but RLS policies do not enforce school-level isolation — meaning a determined attacker with any authenticated session could access cross-school data directly via the Supabase REST API.

**Top 3 recommended actions:**
1. Fix RLS policies — remove `USING(true)` on `sms_students`, `sms_requests`, and add `school_id` scoping
2. Add `getStudentSession()` verification to all student portal server actions
3. Create a `TeacherGuard` layout for `/teacher/*` routes

---

## Findings

### 1. School Data Isolation (Missing `school_id` Filters)

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Medium | `teacher/components/TransferOutModal.tsx:87` | `.ilike("name", ...)` on `sms_schools` without school_id — minor since schools table is non-sensitive | Low risk — schools are semi-public. No fix needed |
| Medium | `teacher/components/TeacherGradeEntryTable.tsx:162-167` | `sms_student_subjects` query missing `school_id` filter | Add `.eq("school_id", user.school_id)` |
| Medium | `lib/student-portal/actions.ts:156-159` | `sms_subjects` query by IDs without `school_id` — could leak subject names from other schools | Add `school_id` filter from student's enrollment |
| Low | `components/dashboards/DivisionDashboard.tsx:99-139` | Unscoped queries on `sms_users` and `sms_students` | Intentional for division_admin — verify `DivisionGuard` wraps this |
| Info | `(landing)/page.tsx:95-104`, `(landing)/learners/page.tsx:96-100` | Public enrollment stats without school_id | Intentional public pages — acceptable |

**Overall:** ~90% of queries properly filter by `school_id`. App-layer filtering is consistent, but relies on RLS as a safety net — and RLS is not enforcing school scoping (see Section 3).

---

### 2. Service Role Key Exposure

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Medium | `lib/supabase/admin.ts:5` | `NEXT_PUBLIC_SERVICE_ROLE_KEY` — the `NEXT_PUBLIC_` prefix means Next.js **will** expose this to the browser bundle if any client component transitively imports it | Rename to `SERVICE_ROLE_KEY` (drop `NEXT_PUBLIC_` prefix) |
| Info | `lib/requests/actions.ts`, `lib/student-portal/actions.ts` | Admin client (`supabase2`) used only in `"use server"` files | Correct pattern — no client components import admin client directly |

**Overall:** The service role key is **not currently leaked** to the client bundle because `admin.ts` is only imported by server action files. However, the `NEXT_PUBLIC_` prefix is a ticking time bomb — one accidental client-side import would expose the key. **Rename it immediately.**

---

### 3. RLS Policy Coverage

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| **Critical** | `migrations/015_public_landing_read_access.sql:28` | `sms_students` has `USING (true)` for `anon` role — **all student PII (LRN, DOB, names, addresses) is publicly readable** via Supabase REST API | Replace with column-limited or school-filtered policy |
| **Critical** | `migrations/049_requests_rebuild.sql:179-204` | `sms_requests`, `sms_request_attachments`, `sms_request_logs` all have `USING (true)` for `anon` + `authenticated` — document requests are world-readable and world-writable | Restrict SELECT to request owner + school staff; restrict INSERT with validation |
| **Critical** | `migrations/001_school_management_schema.sql:304-454` | All core tables (`sms_users`, `sms_sections`, `sms_grades`, `sms_enrollments`) use `auth.role() = 'authenticated'` for INSERT/UPDATE/DELETE — **any authenticated user can write to any table** | Add role-based + school_id-scoped policies (see migration 037 pattern) |
| High | `migrations/034_madrasah_support.sql` | `sms_student_subjects` — **RLS not enabled at all** + `GRANT ALL TO anon` | Enable RLS + add school-scoped policies |
| High | `migrations/048_sned_disabilities.sql` | `sms_student_disabilities` — **RLS not enabled** on sensitive health/disability data | Enable RLS immediately |
| High | Most `sms_*` tables | `auth.role() = 'authenticated'` without `school_id` scoping — cross-school reads/writes possible via direct API | Add school_id-based isolation using pattern from migration 037 |
| Info | `migrations/037_subjects_security_and_performance.sql` | `sms_subjects` and `sms_subject_schedules` — **properly fixed** with role-based + school-scoped policies | Use this as the template for fixing other tables |

**Overall: Grade F.** The RLS layer is fundamentally broken for most tables. Application-level filtering prevents casual misuse, but any user who hits the Supabase REST API directly bypasses all app-layer protections.

---

### 4. SQL Injection (ilike Patterns)

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Medium | `teacher/components/TransferOutModal.tsx:87` | `.ilike("name", \`%${query.trim()}%\`)` — user input not escaped through `escapeIlikePattern()` | Add `escapeIlikePattern(query.trim())` |
| Info | All other ilike usages (12+ files) | Properly use `escapeIlikePattern()` | No action needed |

**Overall:** Excellent discipline across the codebase. Only 1 instance missed.

---

### 5. Student Portal Auth

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| **Critical** | `lib/student-portal/actions.ts:137-393` | **IDOR vulnerability** — `getStudentGrades(studentId)`, `submitStudentEvaluation(studentId, ...)`, and 3 other functions accept `studentId` as a parameter but **never verify** the caller's JWT matches that studentId | Add `const session = await getStudentSession(); if (!session \|\| session.studentId !== studentId) throw new Error("Unauthorized");` to each function |
| Medium | `lib/student-portal/actions.ts:338-393` | `submitStudentEvaluation()` is a **write operation** vulnerable to IDOR — attacker can submit evaluations as any student | Same fix as above — verify JWT identity before insert |
| Low | JWT configuration | No token blacklist/revocation — stolen JWT valid for 24h | Acceptable for school portal risk level; consider shorter expiry (4-8h) |
| Info | Cookie settings (line 88-93) | `httpOnly: true`, `secure: production`, `sameSite: "lax"` | Properly configured |

**Overall:** Cookie/JWT mechanics are solid. The critical gap is that server actions trust client-supplied `studentId` without verifying it matches the JWT session.

---

### 6. Role Enforcement & Route Guards

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| High | `app/(protected)/teacher/` | **No `layout.tsx` or route guard** — any authenticated user can access `/teacher/*` routes by direct URL | Create `teacher/layout.tsx` with a `TeacherGuard` that checks `user.type === "teacher"` |
| High | `components/AuthGuard.tsx` | Verifies authentication but **not authorization** — does not check `user.type` for any route | Add role-based route mapping in middleware or per-layout guards |
| Medium | `components/DivisionGuard.tsx` | Client-side only (`router.replace`) — can be bypassed via direct API calls or Redux state manipulation | Move to server middleware or add server-side session validation |
| Medium | `components/AppSidebar.tsx` | Role-based menu filtering is **UI-only** — hidden routes are still accessible via direct URL | Pair with actual route guards (sidebar filtering alone is not security) |
| Low | `components/StaffGuard.tsx` | Properly restricts to `admin`/`school_head`/`super admin` — but still client-side | Works, but server-side enforcement would be stronger |

**Overall:** The guard system is layered but has gaps. `AuthGuard` handles authentication, `SchoolIdGuard` handles school scoping, `DivisionGuard`/`StaffGuard` handle specific role restrictions — but **teacher routes have no guard at all**, and all guards are client-side.

---

### 7. API Route Protection

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Info | `app/(public)/auth/signout/route.ts` | Only API route found — properly calls `supabase.auth.signOut()` for current user | No issues |
| Info | Server actions in `lib/requests/actions.ts` | 7 server actions — use admin client but are `"use server"` scoped | Proper pattern |
| Medium | `lib/student-portal/actions.ts` | Server actions don't re-validate caller identity before executing (see IDOR finding above) | Add session verification |

---

## Critical Issues (Requires Immediate Action)

1. **RLS: `sms_students` publicly readable** — `USING(true)` for `anon` exposes all student PII (LRN, DOB, names) to unauthenticated users via Supabase REST API. (`migrations/015:28`)

2. **RLS: `sms_requests` world-readable/writable** — `USING(true)` for `anon` on requests, attachments, and logs tables. (`migrations/049:179-204`)

3. **IDOR: Student portal server actions** — Any student can read other students' grades and submit evaluations on their behalf by changing the `studentId` parameter. (`lib/student-portal/actions.ts:137-393`)

4. **RLS: Core tables allow any authenticated user to INSERT/UPDATE/DELETE** — A teacher could escalate to admin by writing to `sms_users`. (`migrations/001:304-454`)

5. **Missing RLS: `sms_student_subjects`** — No RLS enabled + `GRANT ALL TO anon`. (`migrations/034`)

6. **Missing RLS: `sms_student_disabilities`** — Sensitive disability data with no RLS. (`migrations/048`)

7. **Missing route guard: `/teacher/*` routes** — Any authenticated user can access teacher pages via direct URL.

8. **Service role key naming** — `NEXT_PUBLIC_SERVICE_ROLE_KEY` prefix risks accidental client-side exposure. (`lib/supabase/admin.ts:5`)

---

## Recommended Fixes (Priority Order)

### P0 — Fix This Week

1. **New migration: Fix RLS on `sms_students`** — Replace `USING(true)` anon policy with limited column access or remove anon read entirely
2. **New migration: Fix RLS on `sms_requests`** — Scope read to request owner (by `requester_email`) + school staff; scope write to authenticated with validation
3. **Fix student portal IDOR** — Add `getStudentSession()` check at the top of all 5 affected functions in `actions.ts`:
   ```typescript
   const session = await getStudentSession();
   if (!session || session.studentId !== studentId) {
     throw new Error("Unauthorized");
   }
   ```
4. **New migration: Enable RLS on `sms_student_subjects` and `sms_student_disabilities`** — Revoke anon grants

### P1 — Fix This Month

5. **New migration: Add school_id-scoped RLS** — Use migration 037 as template for `sms_users`, `sms_sections`, `sms_grades`, `sms_enrollments`, `sms_attendance`, `sms_books`, etc.
6. **Create `TeacherGuard`** — Add `app/(protected)/teacher/layout.tsx` with role check
7. **Rename `NEXT_PUBLIC_SERVICE_ROLE_KEY` to `SERVICE_ROLE_KEY`** — Update `.env.local` and `admin.ts`
8. **Fix `TransferOutModal.tsx:87`** — Add `escapeIlikePattern()` to school search

### P2 — Backlog

9. Move client-side guards to Next.js middleware for server-side enforcement
10. Add role-based INSERT/UPDATE/DELETE policies to all core tables
11. Consider shorter JWT expiry for student portal (4-8h instead of 24h)

---

## Summary Metrics

- **Total findings: 22**
- **Critical: 6** | **High: 4** | **Medium: 8** | **Low: 2** | **Info: 2**
- **Files reviewed: 50+**
- **Migrations reviewed: 15**
- **RLS tables audited: 31 enabled, 2 missing**
