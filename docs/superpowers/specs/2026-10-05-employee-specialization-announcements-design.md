# Employee Specialization, Division Announcements & Specialization Report — Design

Date: 2026-10-05 · Migration: 198

## Intent

The division wants every employee's academic and work specialization on record, captured by the
employee themselves rather than typed by a school's admin, and wants a way to tell every employee to
do it. Three outcomes:

1. Personal fields (position, sex, specialization) leave the `/staff` add/edit modal and are
   self-maintained on `/profile`.
2. Division office can post announcements that land in every targeted employee's notification bell.
3. Division and school levels can report who holds which major/specialization, and who has not
   answered yet.

## Decisions (agreed with user)

- Sex and Position move to `/profile` (not dropped). Existing values are preserved.
- Part 3 ("specialization during work at DepEd") **is** the existing `sms_users.learning_area`
  column (146). The 205 existing answers carry over; the division Teaching Specialization report keeps
  working unchanged.
- One choice per part, each list carrying **General** and **Other (specify)**.
- Announcement audience is picked per announcement: all employees (default), teachers only, school
  heads only; optionally narrowed to one school.

## Finding that shapes part 2

The notification bell (`components/notifications/*`, `lib/notifications/service.ts`) reads
`public.adm_notifications`, which does not exist in the schema (no migration creates it; absent from
the local `pg_dump` clone of production). The bell therefore always shows 0. It is rewired to
announcements; the dead `adm_notifications` service is removed (it has no other callers).

## 1. `/staff` modal (`app/(protected)/staff/AddModal.tsx`)

- Remove the Position/Designation, Sex and Teaching Specialization fields and their schema keys.
- The save payload **omits** `position`, `gender`, `learning_area` entirely, so editing a staff record
  never nulls them. New records leave them NULL until the employee fills `/profile`.

## 2. `/profile` — Sex + Specialization section

- **Sex** select (`male` / `female`, column `gender`) beside the existing Position field.
- **Specialization** card, anchor `#specialization`, three selects:
  1. Undergraduate major (college) → new column `sms_users.undergrad_major TEXT`
  2. Graduate major (master's / doctorate) → new column `sms_users.graduate_major TEXT`
  3. Specialization at DepEd → existing `sms_users.learning_area`
- Value stored is the list **code**; choosing *Other* reveals a text input and stores
  `other:<typed text>` (trimmed, ≤120 chars) so the report can show what was typed while still
  grouping all "Other" answers. Parts 1–2 are free TEXT validated in the app against
  `lib/constants/employeeMajors.ts` (119/132 precedent — a list revision needs no migration).
  Part 3 keeps `LEARNING_AREAS` codes; part 3's existing `other` code stays valid.
- Shown to every logged-in employee. Login-disabled roles (accounting, security guard, utility
  worker) cannot log in and so cannot self-fill — known gap, visible in the report's "not yet
  updated" list.
- Profile saves through the existing self-update path on `sms_users` (own row).

### Lists (`lib/constants/employeeMajors.ts`)

Sources: CHED CMO 74–82 s.2017 teacher-education PSGs (BEEd, BECEd, BSNEd, BTLEd, BPEd, BCAEd, BSEd
majors English, Filipino, Mathematics, Science, Social Studies, Values Education), legacy BSEd/BEEd
majors still held by serving teachers, and common Philippine MAEd/MEd/MAT/EdD/PhD majors.

**Undergraduate:** General Education (BEEd General); BEEd – Pre-school / Early Childhood; BEEd – SPED;
BEEd – Content (English, Filipino, Math, Science, Social Studies); BECEd; BSNEd; BSEd – English;
BSEd – Filipino; BSEd – Mathematics; BSEd – Science (General); BSEd – Biological Science; BSEd –
Physical Science; BSEd – Social Studies; BSEd – Values Education; BSEd – MAPEH; BSEd – TLE; BSEd –
Religious Education; BTLEd – Home Economics; BTLEd – Industrial Arts; BTLEd – ICT; BTVTEd; BPEd;
BCAEd (Culture & Arts); BLIS (Library Science); Non-education degree – Nursing / Health; Business /
Accountancy; Engineering / Technology; Information Technology / Computer Science; Agriculture;
Arts & Sciences (AB/BS); Criminology; Other.

**Graduate:** None / not yet pursued; General Education; Educational Management / Administration &
Supervision; Guidance & Counseling; English / Language Teaching; Filipino; Mathematics Education;
Science Education; Social Studies; Values Education; MAPEH / Physical Education; TLE / Home
Economics; Reading; Special Education; Early Childhood Education; ICT / Computer Education; Library
Science; Public Administration; Nursing / Health; Doctorate – Educational Management (EdD/PhD);
Doctorate – Other field; Other.

**Specialization at DepEd** (`LEARNING_AREAS`, extended): existing codes plus `general` (General
Education), `sped` (SPED), `als` (ALS). Adding codes adds columns to the Teaching Specialization
report only where someone holds them.

## 3. Announcements (migration 198)

### Tables (`procurements`)

`sms_announcements`
- `id BIGSERIAL PK`, `title TEXT NOT NULL`, `body TEXT NOT NULL`
- `audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','teachers','school_heads'))`
- `school_id BIGINT NULL REFERENCES sms_schools ON DELETE CASCADE` — NULL = all schools
- `link_path TEXT NULL` — internal path only (must start with `/`, CHECK)
- `created_by BIGINT REFERENCES sms_users ON DELETE SET NULL`, `created_at`, `updated_at`
- `archived_at TIMESTAMPTZ NULL` — archived announcements leave the bell; never deleted

`sms_announcement_reads`
- `(announcement_id, user_id)` PK, `read_at TIMESTAMPTZ DEFAULT now()`, both FKs `ON DELETE CASCADE`

No fan-out: unread = announcements targeting the user minus their read rows. A user hired later sees
announcements still live.

### Targeting (one SQL function, used by RLS and by the bell)

`announcement_targets_me(a sms_announcements)` — a STABLE helper (SECURITY DEFINER, pinned search_path, so the sms_users lookup is not blocked by RLS) reading the caller's
active `type` and `school_id` (163/134: active role, never "any assigned role"):
- `school_id` set → caller's active school must equal it.
- `audience='teachers'` → caller type in (`teacher`, `volunteer_teacher`).
- `audience='school_heads'` → caller type in (`school_head`, `assistant_school_head`).
- `audience='all'` → any staff.
Division authors always see every announcement.

### RLS

- `sms_announcements` SELECT: author roles (`division_admin`, `super admin`, `division_type`) see all;
  others see non-archived rows that target them. INSERT/UPDATE: author roles only; no DELETE policy
  (archive instead). `created_by` forced to caller by trigger.
- `sms_announcement_reads` SELECT/INSERT: own `user_id` only (resolved from `auth.uid()` →
  `sms_users`); no UPDATE/DELETE. Author roles may SELECT all (for read counts).
- Read count for the authoring page via `announcement_read_stats()` SECURITY DEFINER, author roles
  only, returning `(announcement_id, read_count, target_count)`; target count computed with the same
  targeting rules over `sms_users` (excluding login-disabled types).

### UI

- `/division/announcements` (sidebar under Division Office): list (title, audience, school, date,
  "read by X of Y", archived badge), New/Edit modal (title, body, audience, optional school picker,
  link preset: *None* / *Update your specialization → /profile#specialization* / custom path),
  Archive/Unarchive.
- Bell (`NotificationBell`, `NotificationDropdown`, `NotificationItem`): client queries against
  `procurements` via `lib/announcements/` — unread count polled every 30 s as today; dropdown lists
  latest 20 targeted announcements with unread styling; click inserts a read row (idempotent upsert)
  and navigates to `link_path` if set; "Mark all as read".

## 4. Employee Specialization report

- Shared component `components/reports/EmployeeSpecializationReport.tsx`, mounted at
  `/division/reports/employee-specialization` (school picker incl. "All schools") and
  `/school-reports/employee-specialization` (via `ReportSchoolContext`, pinned for school users).
  Linked from both report index pages.
- Data: RPC `employee_specialization_roster(p_school_id BIGINT)` SECURITY DEFINER with 157's guard
  (NULL scope = division roles only; a school = division roles, that school's staff, 134 assignees).
  Returns per active employee: school, name, type, gender, undergrad_major, graduate_major,
  learning_area. Excludes `division_*` / `super admin` / `qa`-only accounts and inactive users. All
  columns cast to declared types (157 lesson).
- Views: three count tables (one per part) with Male / Female / Unspecified / Total per major;
  roster table with search and a **"Not yet updated"** filter (any of the three blank).
  Export Excel (xlsx) and PDF (shared `reportShell`).

## Error handling

- Profile save shows toast on failure; Other requires non-empty text.
- Announcement modal validates title/body non-empty, link path starts with `/`.
- Bell swallows fetch errors (logs) and shows 0, as today.

## Testing

- `supabase/tests/198_announcements.sql` (one transaction, rolled back): targeting per audience and
  school, non-author cannot insert, user cannot read others' read rows, archived hidden from bell,
  read stats counts, roster guard.
- Vitest: `employeeMajors` codes unique, `Other` encoding round-trip, label lookup.
- Manual check on local stack only (`.env.development.local`).

## Out of scope

- Email/push delivery; per-employee targeting; history of specialization changes.
- Applying migration 198 to production (user's job).
