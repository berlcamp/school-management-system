# Security Audit Reference

## Auth Guards

| Guard | File | Protects |
|-------|------|----------|
| `AuthGuard` | `components/AuthGuard.tsx` | All `(protected)/` routes |
| `StudentAuthGuard` | `components/StudentAuthGuard.tsx` | `student-portal/` routes |
| `SchoolIdGuard` | `components/SchoolIdGuard.tsx` | Routes requiring school context |

### AuthGuard Checklist
- Every page under `app/(protected)/` must be wrapped or have AuthGuard in the layout
- Division admin routes under `app/(protected)/division/` should check `user.type === "division_admin"`
- Teacher-only routes under `app/(protected)/teacher/` must verify `user.type === "teacher"`
- Librarian-only features must check `user.type === "librarian"`

### SchoolIdGuard
- Only `division_admin` can have `null` school_id
- All other roles must have a non-null `school_id` — `SchoolIdGuard` enforces this
- Never skip `SchoolIdGuard` for components that do school-scoped queries

## Role Hierarchy & Permissions

| Role | School Access | Division Access | Notes |
|------|--------------|-----------------|-------|
| `school_head` | Full own school | None | Can configure settings |
| `admin` | Full own school | None | |
| `registrar` | Full own school | None | |
| `librarian` | Books module only | None | |
| `teacher` | Own sections/subjects | None | Grade entry, books issue/return |
| `division_admin` | All schools (read) | Full | No school_id constraint |
| `super admin` | All schools | All | System-level access |

## Supabase Client Security

| Client | Schema | Use Case | Risk |
|--------|--------|----------|------|
| `lib/supabase/client.ts` | `procurements` | Client-side CRUD | Bound by RLS |
| `lib/supabase/server.ts` | `public` | Server-side (wrong for SMS!) | Must override schema |
| `lib/supabase/admin.ts` | `procurements` | Admin RPCs | BYPASSES RLS |

**Critical rule**: The admin client bypasses RLS. It must NEVER be used in client components or public-facing routes. Only use in server actions after re-validating the user session.

```bash
# Find any admin client usage in client components
grep -rn "createAdminClient\|supabaseAdmin" app/ components/ --include="*.tsx"
```

## Service Role Key

`NEXT_PUBLIC_SERVICE_ROLE_KEY` is incorrectly named with `NEXT_PUBLIC_` prefix — this means it's potentially exposed to the browser. Verify:
1. It's only read in server-side code (server actions, API routes, `lib/supabase/admin.ts`)
2. It never appears in any client component's runtime bundle
3. Consider renaming to `SERVICE_ROLE_KEY` (without `NEXT_PUBLIC_`) to prevent accidental exposure

## SQL Injection Prevention

All user-supplied filter strings for `ilike` queries MUST use `escapeIlikePattern()` from `@/lib/utils`:

```typescript
// Correct
const escaped = escapeIlikePattern(searchQuery)
supabase.from("sms_students").select("*").ilike("name", `%${escaped}%`)

// WRONG — SQL injection risk
supabase.from("sms_students").select("*").ilike("name", `%${searchQuery}%`)
```

## Student Portal Security

- Authentication: LRN + DOB → JWT cookie (via `jose`)
- JWT is set as `httpOnly` cookie — cannot be read by JavaScript
- `StudentAuthGuard` validates JWT on every protected student portal page
- Students must NEVER access Supabase Auth or staff routes
- Server actions in `lib/student-portal/actions.ts` must re-validate the JWT cookie, never trust client-passed student_id

## RLS Migration Audit (check these migrations explicitly)

The application enforces `school_id` filtering at the application layer, but most RLS policies only check `auth.role() = 'authenticated'` — no database-level school scoping. Always read the actual migration files to verify what the DB-level policies actually say.

**Known permissive policies to verify:**

| Migration | Table | Known Risk |
|-----------|-------|-----------|
| `015_public_landing_read_access.sql` | `sms_students` | `USING (true)` for `anon` role — all student PII including LRNs and DOBs publicly readable |
| `005_grant_permissions.sql` | `sms_students` | `GRANT SELECT ON sms_students TO anon` — must also be revoked, not just the policy |
| `049_requests_rebuild.sql` | `sms_requests`, `sms_request_attachments`, `sms_request_logs` | `USING (true)` for both `anon` and `authenticated` — all document requests and audit logs world-readable/writable |
| `041_fix_subjects_select_rls.sql` | `sms_subjects`, `sms_subject_schedules` | Deliberately reverted school-scoped SELECT policy to `authenticated` only; comment says "app filters client-side" |
| `001_school_management_schema.sql` | `sms_form137_requests` | `USING (auth.role() = 'authenticated' OR true)` — equivalent to `USING (true)`, fully public |
| `054_evaluations.sql` | `sms_evaluations`, `sms_evaluation_questions`, `sms_evaluation_responses` | `authenticated` only, no school_id scoping — staff can read other schools' evaluations |

**Critical:** `sms_students` has anon read because of the public landing page showing enrollment stats. The correct fix is a `SECURITY DEFINER` function that returns aggregate counts only — not a `USING (true)` policy on the full table.

**Grep commands to find permissive policies:**
```bash
# Find all USING (true) or USING (auth.role() = 'authenticated') policies
grep -rn "USING (true)\|USING (auth.role" supabase/migrations/ | grep -v "record_requests"

# Find anon grants on sensitive tables  
grep -rn "TO anon\|FOR anon\|anon," supabase/migrations/ | grep -v "^--"
```

**The correct RLS pattern** (used in `sms_record_requests` — the best example in the codebase):
```sql
USING (
  auth.role() = 'authenticated'
  AND school_id = (
    SELECT school_id FROM procurements.sms_users
    WHERE user_id = auth.uid() LIMIT 1
  )
)
```

## Data Isolation Invariants

1. School staff can only see their own school's data (enforced by `school_id` filter + RLS)
2. Transfer record access is time-limited: only while `record_access_granted = true` on `sms_record_requests`
3. Student grades are accessible cross-school only via `has_record_access()` RLS function
4. Public routes (`(public)/`, `(landing)/`) must never expose PII — use aggregate functions, not raw table access

## Common Vulnerability Patterns to Check

- **Broken Object Level Authorization**: Does the API verify the requested resource belongs to the user's school?
- **Mass Assignment**: Are there endpoints that accept arbitrary fields and pass them to `.update()`?
- **Insecure Direct Object Reference**: Does fetching by ID also check school_id?
- **Missing Auth on Server Actions**: Do all server actions call `createServerClient()` and verify session?
- **Exposed Admin Operations**: Is the admin client accidentally imported in a shared utility used client-side?
- **Rate Limiting**: Is the student portal login (LRN + DOB) rate-limited? DOB is a small search space for brute-force if the LRN is known.
- **Deprecated Tables**: Are there old tables (e.g., `sms_form137_requests`) with permissive policies that were never cleaned up?
