---
name: code-audit-sms
description: Perform a comprehensive code audit of the School Management System (SMS) codebase for the Schools Division of Bayugan City (DepEd). Use this skill whenever the user asks to audit the codebase, review code quality, check for security issues, validate DepEd workflows, look for bugs or anti-patterns, do a system review, check the architecture, or says anything like "audit the code", "review the system", "check for issues", "is the code good?", or "what's wrong with the codebase?". This skill should also trigger when the user asks about enrollment logic, promotion/graduation correctness, Supabase security, role-based access, or performance issues across the SMS. Always use this skill for any broad or multi-area code review request, even if it sounds casual.
---

# SMS Code Audit Skill

You are performing a comprehensive code audit of a Next.js 16 + Supabase School Management System for the Schools Division of Bayugan City (DepEd Philippines). Your job is to produce an actionable, structured audit report.

## Audit Scope

Run all 7 audit passes. Do not skip any — each surfaces different types of issues. Use the references directory for detailed checklists:

- `references/architecture.md` — architecture and structure checks
- `references/deped-workflows.md` — DepEd business logic invariants
- `references/security.md` — auth and security patterns

## How to Conduct the Audit

Work systematically through the codebase. Use `grep`, `glob`, and `read` tools extensively. Don't just read a few files — dig into the actual code. For each finding, record:
- **Location**: exact file path + line number
- **Severity**: Critical / High / Medium / Low / Info
- **Issue**: what's wrong
- **Recommendation**: what to fix and how

### Pass 1: Architecture Review

Explore the overall structure:
- Read `app/(protected)/` directory tree for layout violations (server/client component mixing, missing layouts)
- Check that page-specific components are co-located under `components/` subfolders (per AGENTS.md convention)
- Look for overly large files (>300 lines) that should be split
- Verify `lib/supabase/server.ts` schema is `public` — SMS queries from server actions MUST use the admin or client (procurements schema), not the server helper directly without overriding schema
- Check for circular imports or misplaced utilities

Key invariant: **`lib/supabase/server.ts` uses `public` schema; client/admin use `procurements`**. Server-side SMS queries that use `createClient()` from server.ts without explicitly setting schema are a bug.

```bash
# Quick check for potential schema mismatch
grep -rn "createClient" app/ lib/ --include="*.ts" --include="*.tsx"
```

### Pass 2: Database & Supabase Review

- Scan all Supabase queries for missing `school_id` filters in school-scoped tables (`sms_students`, `sms_enrollments`, `sms_sections`, `sms_subjects`, `sms_schedules`, etc.)
- Check that `escapeIlikePattern()` is used for all user-supplied `ilike` search strings (SQL injection prevention)
- Look for N+1 query patterns: fetching a list then looping to fetch related data
- Check for missing `.single()` vs `.maybeSingle()` — `.single()` throws if 0 rows, which can cause unhandled errors
- Verify RPC calls pass the correct parameter names
- Identify any direct `DELETE` or `UPDATE` without a `WHERE` clause scoped to `school_id`
- Check migration files for missing RLS policies on new tables

```bash
grep -rn "ilike" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v "escapeIlikePattern"
grep -rn "\.from(" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v "school_id"
```

### Pass 3: Business Logic Validation (DepEd Workflows)

This is the most critical pass. Verify these invariants are correct in the code:

#### Enrollment & Status Lifecycle
Valid statuses: `active`, `completed`, `transferred_out`, `dropped`, `pending_transfer`, `pending_review`, `retained`, `promoted`, `graduated`

Check:
- No code sets a `promoted` enrollment to have a `section_id` — promoted students must not be section-assigned
- `graduated` status is only applied to Grade 12 (SHS) or Grade 6 (Elementary) completers
- `completed` vs `promoted` vs `graduated` are not confused — `completed` means finished the school year but not promoted yet; `promoted` means passed to next grade
- `dropped` enrollments are never re-activated without going through the enrollment wizard
- `pending_transfer` and `pending_review` always require the two-stage approval flow — no shortcuts

#### Promotion Logic
Read `enrollment/` pages and any promotion RPCs. Verify:
- Promotion does NOT assign a section (section assignment happens during enrollment for the new school year)
- Promotion triggers the right status transition (`active` → `promoted`)
- The `promote_students` RPC (or equivalent) checks promotion deadline from settings

#### Graduation Logic
- Only eligible grade levels can be marked `graduated`
- Graduated students should not appear in active enrollment lists

#### Transfer Two-Stage Approval
Read `manage-requests/` and `enrollment/components/EnrollmentWizard.tsx`. Verify:
- Stage 1: `enroll_student_with_record_request` creates both a record request AND enrollment in one atomic RPC
- Stage 2: Origin school approval sets `record_access_granted = true` but does NOT auto-approve enrollment
- Stage 3: Destination staff explicitly calls `review_transfer_enrollment` RPC — no auto-approval path exists
- `StudentEntryMode` is only `"new" | "existing" | "transferee"` — there must be no `pre_released` bypass

#### Grade Entry
- Teachers can only enter grades for subjects where they appear in `sms_subject_schedules` OR are the section adviser
- Grades are keyed by `(student_id, subject_id, section_id, grading_period, school_year)` — check for missing keys in upserts
- Grading periods must be 1–4 only

#### Evaluation System
- Students can only submit evaluations for teachers who teach their enrolled section
- Duplicate submissions must be blocked (unique constraint on `sms_evaluation_responses`)
- Ratings must be 1–5 (Likert scale)

### Pass 4: Code Quality

Scan for:

**Anti-patterns:**
- `any` TypeScript types (violates AGENTS.md) — `grep -rn ": any" app/ lib/ types/`
- Inline styles instead of Tailwind classes
- Direct DOM manipulation (`document.getElementById`) in React components
- `useEffect` with missing or incorrect dependency arrays
- State updates inside render (causing infinite loops)
- Magic numbers/strings not extracted to constants

**Duplication:**
- Multiple places building the same Supabase query — look for copy-pasted `.from("sms_enrollments")` blocks with identical filters
- Multiple `getCurrentSchoolYear()` reimplementations
- Repeated modal/dialog patterns that should be shared components

**Readability:**
- Functions longer than 80 lines
- Components longer than 200 lines
- Deeply nested ternaries (more than 2 levels)
- Boolean parameter flags that flip behavior — prefer separate functions

### Pass 5: Security Review

**Authentication & Authorization:**
- Every `(protected)/` route must be wrapped by `AuthGuard` — verify no gaps
- Division admin routes must check `user.type === "division_admin"` not just authentication
- Teacher routes (`teacher/`) must verify `user.type === "teacher"` — staff should not access teacher-only views
- Student portal routes must use `StudentAuthGuard` (JWT cookie), never Supabase Auth
- `SchoolIdGuard` must wrap any component that accesses school-scoped data — except for `division_admin`

**API / Server Actions:**
- Server actions must re-validate user session — never trust client-passed `school_id`
- Check for any server action that accepts `school_id` as a parameter without re-reading it from the session
- Ensure `NEXT_PUBLIC_SERVICE_ROLE_KEY` is only used server-side (in admin client), never in client components

**Data Exposure:**
- Student PII (LRN, DOB, addresses) must not be exposed in public routes
- Form 137 requests must validate requester identity before returning documents
- Check that RLS policies on sensitive tables are not accidentally bypassed via `admin` client in client components

**RLS Migration Audit (always read the actual migrations — app-layer filtering is not enough):**
- Check `references/security.md` for the full table of known permissive policies
- Key risk: `sms_students` has `USING (true)` for the `anon` role (migration 015) — all student PII including LRNs and DOBs is publicly readable via the Supabase REST API
- Key risk: `sms_requests`/logs/attachments have `USING (true)` for `anon` (migration 049) — document requests world-readable
- Most tables use `auth.role() = 'authenticated'` with no `school_id` scoping — cross-school access is only blocked at the app layer, not the DB layer

```bash
grep -rn "SERVICE_ROLE_KEY" app/ components/ --include="*.tsx" --include="*.ts"
grep -rn "USING (true)\|TO anon" supabase/migrations/ | grep -v "^--"
```

### Pass 6: Performance Review

**React:**
- Missing `useMemo`/`useCallback` on expensive computations or stable callbacks passed to children
- Large lists rendered without virtualization (react-window or similar)
- Images without `next/image` (no lazy loading/optimization)
- Heavy components not wrapped in `React.memo` or `dynamic()` for code splitting

**Data Fetching:**
- Fetching entire tables without pagination — look for `.from("sms_students").select("*")` without `.range()`
- Over-fetching: `select("*")` when only 2-3 columns are needed
- `useEffect`-based fetches that re-run on every render due to missing deps or unstable references
- Missing `isMounted` flag checks (per AGENTS.md convention) — can cause setState after unmount warnings

**Supabase:**
- Missing indexes implied by frequent filter columns (`school_id`, `school_year`, `status`)
- Fetching related data in loops instead of using Supabase joins (`.select("*, sms_sections(*)")`)

```bash
grep -rn 'select("\*")' app/ lib/ --include="*.ts" --include="*.tsx" | grep -v "count\|head"
grep -rn "useEffect" app/ components/ --include="*.tsx" | wc -l
```

### Pass 7: QA & Edge Cases

Check for missing validations:

- **School year boundary**: what happens when `getCurrentSchoolYear()` is called at the year boundary (e.g., June/July transition)?
- **Empty states**: do list pages handle 0 results gracefully, or do they crash on `.map()` of `undefined`?
- **Concurrent enrollment**: can a student be enrolled twice in the same school year? Is there a unique constraint?
- **Grade boundary**: are grades clamped to 0–100? What happens if a teacher enters `101` or `-1`?
- **LRN validation**: is LRN validated as 12 digits everywhere it's entered?
- **Section capacity**: is there a max student cap enforced, or can unlimited students be added?
- **Deleted references**: if a subject is deleted, are its schedule entries and grades cleaned up?
- **Transfer to same school**: what happens if a transferee's LRN resolves to the same school?
- **Promotion deadline**: what happens after the promotion deadline passes — is the UI locked? Are there server-side checks too (not just client-side)?
- **Evaluation after teacher reassignment**: if a teacher is removed from a section, can students still submit evaluations?

---

## Output Format

Produce the report in this exact structure:

```
# SMS Code Audit Report
**Date:** [current date]
**Scope:** [what was audited — full system or specific area]

## Executive Summary
[2-4 sentences: overall health, most critical finding, top 3 recommended actions]

## Findings by Category

### 1. Architecture
| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| ...

### 2. Database & Supabase
[same table format]

### 3. Business Logic (DepEd Workflows)
[same table format — call out any correctness bugs here prominently]

### 4. Code Quality
[same table format]

### 5. Security
[same table format — mark any Critical findings with ⚠️]

### 6. Performance
[same table format]

### 7. QA & Edge Cases
[same table format]

## Critical Issues (requires immediate action)
[Flat list of all Critical/High severity findings across all categories]

## Recommended Refactoring Opportunities
[Top 3-5 refactors that would have the highest impact on maintainability]

## Summary Metrics
- Total findings: N
- Critical: N | High: N | Medium: N | Low: N | Info: N
- Files reviewed: N
```

---

## Audit Scope Options

If the user specifies a scope (e.g., "audit the enrollment module" or "just check security"), limit the audit to the relevant passes and relevant directories. If no scope is given, run all 7 passes across the full codebase.

**Module → Passes mapping:**
- Enrollment: passes 2, 3, 7
- Security/Auth: pass 5
- Performance: pass 6
- Code quality/refactoring: passes 1, 4
- DepEd compliance: pass 3
- Full audit: all 7 passes

---

## Tips for a High-Quality Audit

- Prefer finding real issues over a clean report. It's better to flag a potential issue with "verify this" than to miss a real bug.
- Prioritize correctness bugs (pass 3) over style issues (pass 4) — a wrong enrollment status is worse than a long function.
- When in doubt about a DepEd workflow, refer to AGENTS.md which documents the authoritative system design.
- For the security pass, think like an attacker: what would happen if a logged-in teacher tried to access another school's data?
- Cross-reference findings: a missing `school_id` filter (pass 2) combined with a missing auth check (pass 5) is a Critical, not two Medium issues.
