# Multi-School Student Records & Transfer System — Implementation Plan

## Context

The current `sms_students` table has a `school_id` column that ties each student to a single school. This is fundamentally broken for the DepEd context where students transfer between schools, and a student's LRN should be a global identifier across all schools. The goal is to separate **student identity** (global, LRN-based) from **school enrollment** (per-school, per-year), enable inter-school transfer workflows, and preserve all existing data.

**Key design decision:** All student creation (new and transferee) happens exclusively in the **Enrollment Module** via a two-step wizard. The Students Module is read/edit only — no "Add Student" there. This ensures every student record is always paired with an enrollment.

---

## Phase Checklist

| # | Phase | Status | Risk |
|---|-------|--------|------|
| 1 | Database Migration (038_multi_school_transfers.sql) | [ ] Not Started | Zero — additive only |
| 2 | TypeScript Types | [ ] Not Started | None — no runtime impact |
| 3 | Record Requests Page (new) | [ ] Not Started | None — new page |
| 4 | Enrollment Wizard — Two-Step Add (new + transferee) | [ ] Not Started | Medium — replaces existing AddModal |
| 5 | Remove Students AddModal | [ ] Not Started | Low — cleanup |
| 6 | Student Profile — Enrollment Timeline | [ ] Not Started | Low — additive display |
| 7 | Students List — Query Migration (future) | [ ] Not Started | High — deferred, needs full testing |

---

## Phase 1: Database Migration

**File:** `supabase/migrations/038_multi_school_transfers.sql`

### 1A. Add columns to `sms_enrollments`

- [ ] Add `enrollment_status TEXT NOT NULL DEFAULT 'active'` with CHECK constraint:
  - `('active', 'completed', 'transferred_out', 'dropped', 'pending_transfer')`
- [ ] Add `origin_school_id BIGINT` FK to `sms_schools`
- [ ] Add `record_request_id BIGINT` (FK added after table creation)

```sql
ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS enrollment_status TEXT NOT NULL DEFAULT 'active'
  CHECK (enrollment_status IN ('active', 'completed', 'transferred_out', 'dropped', 'pending_transfer'));

ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS origin_school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE SET NULL;

ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS record_request_id BIGINT;
```

### 1B. Create `sms_record_requests` table

- [ ] Create table with all columns
- [ ] Add partial unique index for pending requests
- [ ] Add performance indexes
- [ ] Add FK from `sms_enrollments.record_request_id`
- [ ] Add `updated_at` trigger
- [ ] Enable RLS

```sql
CREATE TABLE procurements.sms_record_requests (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  student_lrn TEXT NOT NULL,
  requesting_school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  origin_school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  target_grade_level INTEGER CHECK (target_grade_level >= 0 AND target_grade_level <= 12),
  target_school_year TEXT,
  requested_by BIGINT NOT NULL REFERENCES procurements.sms_users(id),
  approved_by BIGINT REFERENCES procurements.sms_users(id),
  remarks TEXT,
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate pending requests for same student between same schools
CREATE UNIQUE INDEX idx_sms_record_requests_pending_unique
  ON procurements.sms_record_requests(student_id, requesting_school_id, origin_school_id)
  WHERE status = 'pending';

-- Performance indexes
CREATE INDEX idx_sms_record_requests_student ON procurements.sms_record_requests(student_id);
CREATE INDEX idx_sms_record_requests_requesting_school ON procurements.sms_record_requests(requesting_school_id);
CREATE INDEX idx_sms_record_requests_origin_school ON procurements.sms_record_requests(origin_school_id);
CREATE INDEX idx_sms_record_requests_status ON procurements.sms_record_requests(status);
CREATE INDEX idx_sms_record_requests_lrn ON procurements.sms_record_requests(student_lrn);

-- FK from enrollments
ALTER TABLE procurements.sms_enrollments
  ADD CONSTRAINT fk_enrollments_record_request
  FOREIGN KEY (record_request_id) REFERENCES procurements.sms_record_requests(id) ON DELETE SET NULL;

-- Updated_at trigger
CREATE TRIGGER update_sms_record_requests_updated_at
  BEFORE UPDATE ON procurements.sms_record_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE procurements.sms_record_requests ENABLE ROW LEVEL SECURITY;
```

### 1C. Enrollment indexes

- [ ] Add enrollment_status index
- [ ] Add composite index for active enrollments per school

```sql
CREATE INDEX IF NOT EXISTS idx_sms_enrollments_enrollment_status
  ON procurements.sms_enrollments(enrollment_status);

CREATE INDEX IF NOT EXISTS idx_sms_enrollments_active_school
  ON procurements.sms_enrollments(school_id, enrollment_status)
  WHERE enrollment_status = 'active';

CREATE INDEX IF NOT EXISTS idx_sms_enrollments_school_active_student
  ON procurements.sms_enrollments(school_id, student_id)
  WHERE status = 'approved' AND enrollment_status = 'active';
```

### 1D. Backfill existing data

- [ ] Sync enrollment_status from `sms_students.enrollment_status`
- [ ] Backfill `origin_school_id` from enrollment's own `school_id`

```sql
-- transferred students: latest enrollment → 'transferred_out'
UPDATE procurements.sms_enrollments e
SET enrollment_status = 'transferred_out'
FROM procurements.sms_students s
WHERE e.student_id = s.id
  AND s.enrollment_status = 'transferred'
  AND e.status = 'approved'
  AND e.id = (
    SELECT e2.id FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  );

-- graduated students: latest enrollment → 'completed'
UPDATE procurements.sms_enrollments e
SET enrollment_status = 'completed'
FROM procurements.sms_students s
WHERE e.student_id = s.id
  AND s.enrollment_status = 'graduated'
  AND e.status = 'approved'
  AND e.id = (
    SELECT e2.id FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  );

-- dropped students: latest enrollment → 'dropped'
UPDATE procurements.sms_enrollments e
SET enrollment_status = 'dropped'
FROM procurements.sms_students s
WHERE e.student_id = s.id
  AND s.enrollment_status = 'dropped'
  AND e.status = 'approved'
  AND e.id = (
    SELECT e2.id FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  );

-- Backfill origin_school_id
UPDATE procurements.sms_enrollments
SET origin_school_id = school_id
WHERE origin_school_id IS NULL AND school_id IS NOT NULL;
```

### 1E. RLS Policies on `sms_record_requests`

- [ ] SELECT: involved schools + division_admin
- [ ] INSERT: requesting school staff only
- [ ] UPDATE: origin school staff + division_admin (approve/reject)
- [ ] DELETE: division_admin only

```sql
CREATE POLICY "Record requests viewable by involved schools"
  ON procurements.sms_record_requests FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      requesting_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
      OR origin_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
      OR (SELECT type FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1) = 'division_admin'
    )
  );

CREATE POLICY "Record requests insertable by school staff"
  ON procurements.sms_record_requests FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND requesting_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Record requests updatable by origin school"
  ON procurements.sms_record_requests FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      origin_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
      OR (SELECT type FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1) = 'division_admin'
    )
  );

CREATE POLICY "Record requests deletable by division admin"
  ON procurements.sms_record_requests FOR DELETE
  USING (
    (SELECT type FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1) = 'division_admin'
  );
```

### 1F. RPC Functions

- [ ] `lookup_student_by_lrn(p_lrn)` — cross-school preview
- [ ] `enroll_student_with_record_request(...)` — atomic: create enrollment + record request in one transaction
- [ ] `create_record_request(...)` — standalone request creation
- [ ] `respond_to_record_request(...)` — approve/reject with state transitions
- [ ] `cancel_record_request(...)` — requesting school cancels
- [ ] `get_student_current_school(p_student_id)` — returns school_id from latest active enrollment

```sql
-- Cross-school LRN lookup (limited preview)
CREATE OR REPLACE FUNCTION procurements.lookup_student_by_lrn(p_lrn TEXT)
RETURNS TABLE (
  student_id BIGINT, lrn TEXT, first_name TEXT, last_name TEXT,
  middle_name TEXT, suffix TEXT, date_of_birth DATE, gender TEXT,
  current_school_id BIGINT, current_school_name TEXT,
  current_grade_level INTEGER, current_school_year TEXT, enrollment_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.lrn, s.first_name, s.last_name, s.middle_name, s.suffix,
    s.date_of_birth, s.gender, e.school_id, sch.name,
    e.grade_level, e.school_year, e.enrollment_status
  FROM procurements.sms_students s
  LEFT JOIN LATERAL (
    SELECT e2.school_id, e2.grade_level, e2.school_year, e2.enrollment_status
    FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  ) e ON TRUE
  LEFT JOIN procurements.sms_schools sch ON sch.id = e.school_id
  WHERE s.lrn = p_lrn;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Atomic: enroll transferee + create record request in one transaction
-- Called when wizard completes both steps for a transferee
CREATE OR REPLACE FUNCTION procurements.enroll_student_with_record_request(
  p_student_id BIGINT, p_requesting_school_id BIGINT, p_requested_by BIGINT,
  p_section_id BIGINT, p_grade_level INTEGER, p_school_year TEXT,
  p_semester INTEGER DEFAULT NULL, p_remarks TEXT DEFAULT NULL
) RETURNS TABLE (enrollment_id BIGINT, request_id BIGINT) AS $$
DECLARE
  v_origin_school_id BIGINT; v_student_lrn TEXT;
  v_enrollment_id BIGINT; v_request_id BIGINT;
BEGIN
  SELECT lrn INTO v_student_lrn FROM procurements.sms_students WHERE id = p_student_id;
  IF v_student_lrn IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  SELECT e.school_id INTO v_origin_school_id
  FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved'
    AND e.enrollment_status IN ('active', 'completed')
  ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1;

  IF v_origin_school_id IS NULL THEN RAISE EXCEPTION 'Student has no active enrollment'; END IF;
  IF v_origin_school_id = p_requesting_school_id THEN RAISE EXCEPTION 'Student already at this school'; END IF;

  -- Create record request
  INSERT INTO procurements.sms_record_requests (
    student_id, student_lrn, requesting_school_id, origin_school_id,
    requested_by, target_grade_level, target_school_year, remarks
  ) VALUES (
    p_student_id, v_student_lrn, p_requesting_school_id, v_origin_school_id,
    p_requested_by, p_grade_level, p_school_year, p_remarks
  ) RETURNING id INTO v_request_id;

  -- Mark origin enrollment as pending_transfer
  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'pending_transfer'
  WHERE student_id = p_student_id AND school_id = v_origin_school_id
    AND status = 'approved' AND enrollment_status = 'active';

  -- Create new enrollment at requesting school (status = 'pending' until record approved)
  INSERT INTO procurements.sms_enrollments (
    student_id, school_id, section_id, grade_level, school_year, semester,
    status, enrollment_status, origin_school_id, record_request_id, enrolled_by
  ) VALUES (
    p_student_id, p_requesting_school_id, p_section_id, p_grade_level, p_school_year,
    p_semester, 'pending', 'active', v_origin_school_id, v_request_id, p_requested_by
  ) RETURNING id INTO v_enrollment_id;

  -- Update student school_id for backward compat
  UPDATE procurements.sms_students
  SET school_id = p_requesting_school_id, enrollment_status = 'enrolled',
      grade_level = p_grade_level, current_section_id = p_section_id
  WHERE id = p_student_id;

  RETURN QUERY SELECT v_enrollment_id, v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create record request (standalone — used outside of wizard if needed)
CREATE OR REPLACE FUNCTION procurements.create_record_request(
  p_student_id BIGINT, p_requesting_school_id BIGINT, p_requested_by BIGINT,
  p_target_grade_level INTEGER DEFAULT NULL, p_target_school_year TEXT DEFAULT NULL,
  p_remarks TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_origin_school_id BIGINT; v_student_lrn TEXT; v_request_id BIGINT;
BEGIN
  SELECT lrn INTO v_student_lrn FROM procurements.sms_students WHERE id = p_student_id;
  IF v_student_lrn IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  SELECT e.school_id INTO v_origin_school_id
  FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved'
    AND e.enrollment_status IN ('active', 'completed')
  ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1;

  IF v_origin_school_id IS NULL THEN RAISE EXCEPTION 'Student has no active enrollment'; END IF;
  IF v_origin_school_id = p_requesting_school_id THEN RAISE EXCEPTION 'Cannot request from same school'; END IF;

  INSERT INTO procurements.sms_record_requests (
    student_id, student_lrn, requesting_school_id, origin_school_id,
    requested_by, target_grade_level, target_school_year, remarks
  ) VALUES (
    p_student_id, v_student_lrn, p_requesting_school_id, v_origin_school_id,
    p_requested_by, p_target_grade_level, p_target_school_year, p_remarks
  ) RETURNING id INTO v_request_id;

  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'pending_transfer'
  WHERE student_id = p_student_id AND school_id = v_origin_school_id
    AND status = 'approved' AND enrollment_status = 'active';

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve or reject record request
CREATE OR REPLACE FUNCTION procurements.respond_to_record_request(
  p_request_id BIGINT, p_action TEXT, p_responder_id BIGINT,
  p_rejection_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE v_request RECORD;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  SELECT * INTO v_request FROM procurements.sms_record_requests
  WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already processed'; END IF;

  UPDATE procurements.sms_record_requests
  SET status = p_action, approved_by = p_responder_id, responded_at = NOW(),
      rejection_reason = CASE WHEN p_action = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_request_id;

  IF p_action = 'approved' THEN
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'transferred_out', updated_at = NOW()
    WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
      AND status = 'approved' AND enrollment_status IN ('active', 'pending_transfer');

    -- Approve the pending enrollment at the requesting school
    UPDATE procurements.sms_enrollments
    SET status = 'approved', updated_at = NOW()
    WHERE record_request_id = p_request_id AND status = 'pending';
  ELSIF p_action = 'rejected' THEN
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'active', updated_at = NOW()
    WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
      AND status = 'approved' AND enrollment_status = 'pending_transfer';

    -- Remove the pending enrollment at the requesting school
    DELETE FROM procurements.sms_enrollments
    WHERE record_request_id = p_request_id AND status = 'pending';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cancel record request (by requesting school)
CREATE OR REPLACE FUNCTION procurements.cancel_record_request(
  p_request_id BIGINT, p_user_id BIGINT
) RETURNS VOID AS $$
DECLARE v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM procurements.sms_record_requests
  WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already processed'; END IF;

  UPDATE procurements.sms_record_requests SET status = 'cancelled' WHERE id = p_request_id;

  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'active', updated_at = NOW()
  WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
    AND status = 'approved' AND enrollment_status = 'pending_transfer';

  -- Remove the pending enrollment at the requesting school
  DELETE FROM procurements.sms_enrollments
  WHERE record_request_id = p_request_id AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current school
CREATE OR REPLACE FUNCTION procurements.get_student_current_school(p_student_id BIGINT)
RETURNS BIGINT AS $$
  SELECT e.school_id FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved' AND e.enrollment_status = 'active'
  ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1;
$$ LANGUAGE sql STABLE;
```

### 1G. Deprecate `sms_students.school_id`

- [ ] Add comment marking column as deprecated (NOT removed yet)

```sql
COMMENT ON COLUMN procurements.sms_students.school_id
  IS 'DEPRECATED - Use sms_enrollments for school relationship. Kept for backward compatibility.';
```

### 1H. Grant permissions

- [ ] Grant SELECT/INSERT/UPDATE/DELETE on `sms_record_requests` to `authenticated`
- [ ] Grant EXECUTE on new functions to `authenticated`

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_record_requests TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_record_requests_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.lookup_student_by_lrn TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.enroll_student_with_record_request TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.create_record_request TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.respond_to_record_request TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.cancel_record_request TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.get_student_current_school TO authenticated;
```

---

## Phase 2: TypeScript Types

**File:** `types/database.ts`

- [ ] Add `RecordRequestStatus` type: `'pending' | 'approved' | 'rejected' | 'cancelled'`
- [ ] Add `EnrollmentLifecycleStatus` type: `'active' | 'completed' | 'transferred_out' | 'dropped' | 'pending_transfer'`
- [ ] Add `RecordRequest` interface
- [ ] Update `Enrollment` interface with `enrollment_status`, `origin_school_id`, `record_request_id`
- [ ] Add `EnrollmentWizardStep` type: `'student' | 'enrollment'`
- [ ] Add `StudentEntryMode` type: `'new' | 'existing' | 'transferee'`

---

## Phase 3: Record Requests Page (New)

**New files:**
- [ ] `app/(protected)/recordrequests/page.tsx` — main page with two tabs
- [ ] `app/(protected)/recordrequests/components/IncomingRequests.tsx`
- [ ] `app/(protected)/recordrequests/components/OutgoingRequests.tsx`
- [ ] `app/(protected)/recordrequests/components/RequestActions.tsx` (approve/reject/cancel modals)

**Sidebar:**
- [ ] Add entry in `components/AppSidebar.tsx` → `allModuleItems` array:
  ```
  { title: "Record Requests", url: "/recordrequests", icon: ArrowLeftRight, moduleName: "recordrequests" }
  ```

**Incoming Requests tab** (origin_school_id = user.school_id):
- Table: Student LRN, Name, Requesting School, Target Grade, Status, Date
- Actions: Approve / Reject (with reason modal)

**Outgoing Requests tab** (requesting_school_id = user.school_id):
- Table: Student LRN, Name, Origin School, Status, Date
- Actions: Cancel (if pending)

**Pattern:** Follow `app/(protected)/formrequests/requests/page.tsx` for layout, filtering, approval UI.

---

## Phase 4: Enrollment Wizard — Two-Step Add (New Student + Transferee)

**This is the core UI change.** Replace the current `AddModal.tsx` with a full-screen dialog wizard. All student creation (new and transferee) happens here — not in the Students Module.

### New files:
- [ ] `app/(protected)/enrollment/components/EnrollmentWizard.tsx` — orchestrator
- [ ] `app/(protected)/enrollment/components/WizardStepIndicator.tsx` — step progress bar
- [ ] `app/(protected)/enrollment/components/StudentRecordStep.tsx` — Step 1
- [ ] `app/(protected)/enrollment/components/EnrollmentDetailsStep.tsx` — Step 2
- [ ] `app/(protected)/enrollment/components/TransfereeInfoCard.tsx` — transferee preview card
- [ ] `app/(protected)/enrollment/components/LrnLookupField.tsx` — smart LRN input with lookup

### Modify:
- [ ] `app/(protected)/enrollment/AddModal.tsx` — replace body with `<EnrollmentWizard />`

---

### 4A. Wizard Shell (`EnrollmentWizard.tsx`)

**Layout:** Full-width Dialog (shadcn `Dialog` with `DialogContent` using `max-w-4xl`). Two-step horizontal stepper at the top.

```
┌─────────────────────────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════════════════════════╗  │
│  ║  ● Step 1: Student Record ─────── ○ Step 2: Enrollment  ║  │
│  ╚═══════════════════════════════════════════════════════════╝  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │              [ Step content renders here ]               │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  [Cancel]                            [Back] [Continue]  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**State management:**
- `currentStep: 1 | 2`
- `entryMode: 'new' | 'existing' | 'transferee'` — determined by LRN lookup result
- `studentData: Partial<Student>` — collected in Step 1, persisted across steps
- `enrollmentData: Partial<Enrollment>` — collected in Step 2
- `lookupResult: LrnLookupResult | null` — result from cross-school lookup
- Form state preserved when navigating between steps (no data loss on Back)

**Step validation:**
- Step 1 must pass Zod validation before allowing "Continue" to Step 2
- Step 2 must pass before "Submit"
- "Back" always allowed, no data lost
- **Record request only fires on final submit** — never on Step 1 alone

---

### 4B. Step 1: Student Record (`StudentRecordStep.tsx`)

**This step identifies WHO the student is.** Three flows branch from LRN input:

#### LRN Smart Input (`LrnLookupField.tsx`)

The LRN field is the first and most prominent field. It drives the entire step's behavior:

```
┌─ LRN (Learner Reference Number) ──────────────────────────────┐
│  [____________123456789012______________]  [🔍 Checking...]   │
└────────────────────────────────────────────────────────────────┘
```

- Debounced lookup (500ms) via `supabase.rpc("lookup_student_by_lrn", { p_lrn })`
- Shows inline loading spinner during lookup
- Three outcomes determine what renders below:

#### Flow A: LRN Not Found → New Student Form

Full student creation form appears (same fields as current Students AddModal):

```
┌─────────────────────────────────────────────────────────────────┐
│  LRN: [123456789012]                          ✅ Available     │
│                                                                 │
│  ── Personal Information ────────────────────────────────────   │
│  Last Name*     First Name*      Middle Name     Suffix        │
│  [__________]   [__________]     [__________]    [Jr. ▼]      │
│                                                                 │
│  Date of Birth*    Gender*          Mother Tongue               │
│  [2012-05-15]      [Male ▼]         [Cebuano    ]             │
│                                                                 │
│  IP/Ethnic Group       Religion                                 │
│  [______________]      [______________]                         │
│                                                                 │
│  ── Address ─────────────────────────────────────────────────   │
│  Purok          Barangay        Municipality/City    Province   │
│  [________]     [__________]    [______________]     [_______] │
│                                                                 │
│  ── Contact ─────────────────────────────────────────────────   │
│  Contact Number          Email                                  │
│  [______________]        [______________]                       │
│                                                                 │
│  ── Parent/Guardian Information ─────────────────────────────   │
│  Father: Last [______] First [______] Middle [______]          │
│  Mother: Last [______] First [______] Middle [______]          │
│  Guardian: Last [______] First [______] Middle [______]        │
│  Guardian Contact: [______________]                             │
│                                                                 │
│  ── Previous School ─────────────────────────────────────────   │
│  [______________________________________________]              │
│                                                                 │
│  ── Documents ───────────────────────────────────────────────   │
│  Birth Certificate  [📎 Upload]    Good Moral  [📎 Upload]    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Flow B: LRN Found at THIS School → Existing Student

Show a read-only card with the student's info. User proceeds directly to Step 2 to create a new enrollment (e.g., new school year, re-enrollment).

```
┌─────────────────────────────────────────────────────────────────┐
│  LRN: [123456789012]                                           │
│                                                                 │
│  ┌─ Student Found ──────────────────────────────────────────┐  │
│  │  👤  Juan A. Dela Cruz Jr.                               │  │
│  │                                                           │  │
│  │  LRN            123456789012                              │  │
│  │  Date of Birth   May 15, 2012                             │  │
│  │  Gender          Male                                     │  │
│  │  Current Grade   Grade 6                                  │  │
│  │  School Year     2025-2026                                │  │
│  │  Status          Enrolled                                 │  │
│  │                                                           │  │
│  │  ℹ️  This student is already registered at your school.   │  │
│  │     Proceed to enroll for a new school year or section.   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Flow C: LRN Found at ANOTHER School → Transferee

Show a transferee info card with the student's details from the other school. A subtle info banner explains that a record request will be sent upon completion.

```
┌─────────────────────────────────────────────────────────────────┐
│  LRN: [123456789012]                                           │
│                                                                 │
│  ┌─ Transferee Detected ─────────────────────────── 🔄 ─────┐ │
│  │                                                           │  │
│  │  👤  Maria B. Santos                                      │  │
│  │                                                           │  │
│  │  LRN              123456789012                            │  │
│  │  Date of Birth     March 8, 2011                          │  │
│  │  Gender            Female                                 │  │
│  │  Last Grade Level  Grade 5                                │  │
│  │  Previous School   Bayugan Central Elementary School      │  │
│  │  Last School Year  2024-2025                              │  │
│  │  Enrollment Status Active                                 │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ 📋 ─────────────────────────────────────────────────────┐  │
│  │  Completing enrollment will automatically send a record   │  │
│  │  request to the student's previous school. The enrollment │  │
│  │  will remain pending until the request is approved.       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4C. Step 2: Enrollment Details (`EnrollmentDetailsStep.tsx`)

**This step defines WHERE and WHEN the student is enrolled.** Same for all three flows — the form is identical regardless of whether the student is new, existing, or transferee.

```
┌─────────────────────────────────────────────────────────────────┐
│  ── Enrolling: Juan A. Dela Cruz Jr. (123456789012) ─────────  │
│     [Transferee from Bayugan Central ES]  ← badge if transfer  │
│                                                                 │
│  ── Enrollment Details ──────────────────────────────────────   │
│                                                                 │
│  School Year*              Grade Level*                         │
│  [2025-2026 ▼]             [Grade 7 ▼]                         │
│                                                                 │
│  Semester (SHS only)                                            │
│  [1st Semester ▼]          ← only visible for grades 11-12     │
│                                                                 │
│  Section*                                                       │
│  [Section A (Heterogeneous) ▼]                                 │
│                                                                 │
│  ┌─ GPA Recommendation ─────────────────────────────────────┐  │
│  │  📊 Grade 6 GPA: 92.50                                   │  │
│  │  Suggested: Homogeneous - Fast Learner section            │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ← only shown for existing/transferee with prior grades         │
│                                                                 │
│  Remarks (optional)                                             │
│  [__________________________________________________________]  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Section loading:** Dynamically fetches sections when grade_level + school_year change (same as current AddModal).

**GPA recommendation:** Shown when student has prior grades (existing or transferee with approved record). Uses existing `get_student_previous_gpa` RPC.

---

### 4D. Submit Logic (on final "Enroll" click in Step 2)

Three paths based on `entryMode`:

**New Student (`entryMode === 'new'`):**
1. Insert into `sms_students` (create the student record)
2. Insert into `sms_enrollments` (create the enrollment, status = 'approved')
3. Update `sms_students` with `school_id`, `grade_level`, `current_section_id`, `enrollment_status`
4. Upload documents if provided
5. Dispatch Redux `addItem()`
6. Success toast: "Student enrolled successfully"

**Existing Student (`entryMode === 'existing'`):**
1. Insert into `sms_enrollments` (new enrollment for this school year)
2. Update `sms_students` with `grade_level`, `current_section_id`, `enrollment_status`
3. Dispatch Redux `addItem()`
4. Success toast: "Student enrolled successfully"

**Transferee (`entryMode === 'transferee'`):**
1. Call `enroll_student_with_record_request` RPC (atomic: creates enrollment + record request)
2. Dispatch Redux `addItem()`
3. Success toast: "Student enrolled. Record request sent to [Previous School Name]. Enrollment will be approved once the request is accepted."

**Critical:** No record request is created until the wizard is fully completed (both steps). Abandoning at any point = no side effects.

---

### 4E. Wizard UX Details

**Step Indicator (`WizardStepIndicator.tsx`):**
- Horizontal bar with two numbered circles connected by a line
- Active step: filled primary color circle with white number
- Completed step: green checkmark circle
- Upcoming step: gray outline circle with gray number
- Step labels below: "Student Record" / "Enrollment Details"
- Smooth transition animation between steps (CSS transition on the connecting line fill)

**Transitions:**
- Step change uses a subtle slide animation (slide-left for forward, slide-right for back)
- Content area has a fixed min-height to prevent layout shift

**Responsive behavior:**
- Desktop (`>= 1024px`): `max-w-4xl` dialog, 2-3 column grid for form fields
- Tablet (`>= 768px`): `max-w-2xl`, 2-column grid
- Mobile (`< 768px`): Full-screen sheet, single column, step indicator stacks vertically

**Keyboard navigation:**
- `Enter` on last field in Step 1 triggers "Continue" (if valid)
- `Escape` shows confirmation if form has unsaved data

**Loading states:**
- LRN lookup: inline spinner + "Checking..." text next to input
- Submit: button shows spinner + "Enrolling..." text, all inputs disabled
- Skeleton loading for section dropdown while fetching

**Error handling:**
- Inline field errors (Zod validation) with red border + message below field
- Toast for server errors (duplicate enrollment, RPC failures)
- If LRN lookup fails (network), show retry button inline

**Empty/edge states:**
- No sections found for grade/year: show "No sections available for this grade level and school year. Please create sections first." with link to Sections page
- LRN field cleared after lookup: reset to initial state, clear student data

---

### 4F. Edit Mode

When editing an existing enrollment (`editData` passed):
- Wizard opens directly at Step 2 (enrollment details only)
- Step indicator shows Step 1 as completed (with student name displayed)
- Student info is read-only summary at top of Step 2
- Can only modify: section, grade level, school year, semester
- No LRN lookup, no student creation

---

## Phase 5: Remove Students AddModal

**Files to modify:**
- [ ] `app/(protected)/students/page.tsx` — remove "Add Student" button from toolbar
- [ ] `app/(protected)/students/AddModal.tsx` — delete file (or keep for edit-only if needed)

**Rationale:** Since all student creation now happens in the Enrollment Wizard, the Students Module becomes a read/edit/view module. The "Add Student" flow in Students was always disconnected from enrollment anyway — this consolidation ensures every student has at least one enrollment.

**Keep in Students Module:**
- Edit student (demographics, address, contact, documents)
- View student profile
- Delete student (if no enrollments)
- Filter/search students

---

## Phase 6: Student Profile — Enrollment Timeline

**File:** `app/(protected)/students/ViewModal.tsx` (or equivalent)

- [ ] Add "Enrollment History" section querying `sms_enrollments` with joined school/section names
- [ ] Display as timeline: school year, school name, grade level, section, status
- [ ] Add "Transfer History" from `sms_record_requests`

---

## Phase 7: Students List — Query Migration (Future/Deferred)

**File:** `app/(protected)/students/page.tsx`

- [ ] Switch from `sms_students.school_id` filter to enrollment-based query
- [ ] Comprehensive testing across all modules before this change
- [ ] Eventually drop `sms_students.school_id` column in a future migration

---

## Transfer Workflow — Complete State Machine

```
School B opens Enrollment Wizard → enters LRN
    |
    v
LRN Lookup (lookup_student_by_lrn RPC)
    |
    +-- Not found → New student form (Step 1) → Enrollment (Step 2) → Normal enrollment
    |
    +-- Found at School B → Existing student card (Step 1) → Enrollment (Step 2) → Re-enrollment
    |
    +-- Found at School A → Transferee card (Step 1) → Enrollment (Step 2) → On Submit:
              |
              v
        enroll_student_with_record_request RPC (atomic):
          +-- Creates sms_record_requests (status = 'pending')
          +-- Marks School A enrollment as 'pending_transfer'
          +-- Creates School B enrollment (status = 'pending')
          +-- Updates sms_students.school_id to School B
              |
              v
        School A sees incoming request on Record Requests page
              |
              +-- [Approve] → respond_to_record_request('approved')
              |     +-- Request status → 'approved'
              |     +-- School A enrollment → 'transferred_out'
              |     +-- School B enrollment → 'approved' (student is now fully enrolled)
              |
              +-- [Reject] → respond_to_record_request('rejected')
                    +-- Request status → 'rejected'
                    +-- School A enrollment → reverts to 'active'
                    +-- School B enrollment → deleted
```

**Key difference from previous plan:** The record request + enrollment are created atomically in a single transaction when the wizard completes. No partial state. No orphaned requests.

---

## Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Duplicate LRNs | Impossible — `lrn` is UNIQUE on `sms_students` |
| Simultaneous requests from 2 schools | First marks enrollment as `pending_transfer`; second RPC fails |
| Rejected transfer | Origin enrollment reverts to `active`; requesting school's pending enrollment is deleted |
| Student with multiple previous schools | Enrollment history shows all; only latest school can approve |
| Cancelled request | Requesting school cancels; origin enrollment reverts to `active`; pending enrollment deleted |
| Wizard abandoned mid-way | No side effects — nothing written to DB until final submit |
| Student already enrolled this year | Duplicate check on submit (existing uq constraint on enrollments) |
| No sections for grade/year | Clear message with link to Sections module |
| LRN lookup network failure | Inline retry button, form not submitted |
| Student portal impact | None — LRN auth is already global |
| Grades/attendance/books | Unaffected — linked by student_id + section_id |
| Edit enrollment | Opens wizard at Step 2, Step 1 shown as completed |

---

## Verification Checklist

- [ ] Migration runs cleanly on production data copy
- [ ] All existing enrollments get `enrollment_status = 'active'` (or correct backfill)
- [ ] Students list, enrollment, grades, attendance, student portal all work (no regressions)
- [ ] E2E: New student → wizard Step 1 (fill form) → Step 2 (enroll) → student + enrollment created
- [ ] E2E: Existing student → wizard Step 1 (LRN found at this school) → Step 2 → new enrollment created
- [ ] E2E: Transferee → wizard Step 1 (LRN found at other school) → Step 2 → enrollment + record request created atomically
- [ ] E2E: School A approves → School B enrollment becomes approved
- [ ] E2E: School A rejects → School B pending enrollment deleted, School A enrollment restored
- [ ] E2E: Cancellation flow works (requesting school cancels pending request)
- [ ] Wizard: Back button preserves all form data
- [ ] Wizard: Abandoning wizard creates no database records
- [ ] Wizard: Edit mode opens at Step 2 correctly
- [ ] Students Module: "Add Student" button removed, edit still works
- [ ] RLS: School A cannot see School C's requests
- [ ] RLS: division_admin sees all requests
- [ ] Student portal: LRN login still works, grades from all schools visible
- [ ] Responsive: Wizard works on mobile, tablet, desktop
