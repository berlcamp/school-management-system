-- =============================================================================
-- 230 — SBFP: teachers view only; a barangay as the Assigned Kitchen
-- =============================================================================
--
-- PART A. A teacher no longer encodes the Feeding Program. Reverses 210's "any
-- teacher may open the programme and encode" and 212/220's "any teacher may log":
-- a `teacher` / `volunteer_teacher` now READS every tab and WRITES one thing, a
-- Hot Meals Quality evaluation (their own, as before: an author edits or removes
-- what they filed). Enforced here, not only by hiding buttons (the 161 lesson).
--
-- The focal person and the SBFP Coordinator (229) keep the manager's rights even
-- when their role is teacher: both go through sbfp_can_manage, which is untouched.
--
-- READ IS WIDENED, deliberately. Until now a teacher read only the beneficiaries
-- they encoded (210), so view only would have meant blank tabs for ever. A teacher
-- now reads their school's beneficiaries, weighings and feeding records, exactly
-- as a registrar or librarian already does. Other schools stay out of reach.
--
-- Existing rows are all kept. A beneficiary a teacher already encoded stays on the
-- programme and on the forms; it just becomes the managers' to edit. The owner
-- branch of sbfp_can_view_beneficiary_row (211) is left as it is: for a teacher it
-- is now covered by sbfp_can_view_all, and it never admits a write.
--
-- PART B. sms_sbfp_kitchen_logs.kitchen_barangay: "Barangay" as an Assigned
-- Kitchen on the Kitchen tool. NULL everywhere else, so every existing log still
-- reads as what it was. Free TEXT, app-validated against BAYUGAN_BARANGAYS in
-- lib/constants/sbfp.ts (per 119), so a renamed barangay never invalidates a filed
-- entry. The Food Dispatch log is not touched.
--
-- BEFORE APPLYING (read-only). Function bodies come from the local clone plus this
-- change. Stop if production carries a branch this file lacks:
--   SELECT pg_get_functiondef('procurements.sbfp_can_view_all(bigint)'::regprocedure);
--   SELECT pg_get_functiondef('procurements.sbfp_can_open(bigint)'::regprocedure);
-- How many rows teachers encoded (they stay; they only stop being editable by the
-- teacher who encoded them):
--   SELECT count(*) FROM procurements.sms_sbfp_beneficiaries b
--     JOIN procurements.sms_users u ON u.id = b.created_by
--    WHERE u.type IN ('teacher', 'volunteer_teacher');
--
-- Five functions replaced with the same signatures, two added, four policies
-- replaced, one nullable column and one CHECK added. No DML. Idempotent.
-- Tests: supabase/tests/230_sbfp_teacher_view_only.sql
-- =============================================================================

-- ------------------------------------------------------------------ Part A ---

-- Opening a programme: 229's body without the teacher branch.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_open(p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT procurements.sbfp_can_manage_school(p_school_id)
      OR procurements.sms_has_designation('sbfp_coordinator', p_school_id);
$$;

-- Adding a beneficiary: managers only. The section argument stays so the policies
-- keep their signature; a manager was never limited by it.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_record(
  p_program_id BIGINT,
  p_section_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id);
$$;

-- Editing a beneficiary, its weighings and feeding records: the encoder's own
-- branch goes, so what a teacher encoded earlier is no longer theirs to change.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_record_beneficiary(p_beneficiary_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM procurements.sms_sbfp_beneficiaries b
     WHERE b.id = p_beneficiary_id
       AND procurements.sbfp_can_manage(b.program_id)
  );
$$;

-- Feedback, Kitchen, Food Dispatch and Receiving: managers only. The Quality tool
-- used this too and moves to its own helpers below. sbfp_can_edit_feedback reads
-- this function, so a teacher's own earlier entries become read only with it.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_log_feedback(p_program_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id);
$$;

-- Reading: 222's body plus the two teacher roles beside registrar and librarian.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_view_all(p_program_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id)
      OR EXISTS (
        SELECT 1
          FROM procurements.sms_sbfp_programs p
          JOIN procurements.sms_users u ON u.user_id = auth.uid()
         WHERE p.id = p_program_id
           AND u.is_active
           AND (
             u.type IN ('division_admin', 'division_type', 'sbfp_viewer')
             OR (u.type IN ('registrar', 'librarian', 'teacher', 'volunteer_teacher')
                 AND u.school_id = p.school_id)
           )
      );
$$;

-- The one thing a teacher still files.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_file_quality(p_program_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id)
      OR EXISTS (
        SELECT 1
          FROM procurements.sms_sbfp_programs p
         WHERE p.id = p_program_id
           AND procurements.sbfp_is_school_teacher(p.school_id)
      );
$$;

CREATE OR REPLACE FUNCTION procurements.sbfp_can_edit_quality(
  p_program_id BIGINT,
  p_created_by BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id)
      OR (
        procurements.sbfp_can_file_quality(p_program_id)
        AND EXISTS (
          SELECT 1 FROM procurements.sms_users u
           WHERE u.user_id = auth.uid() AND u.id = p_created_by
        )
      );
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_can_file_quality(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_can_edit_quality(BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_file_quality(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_edit_quality(BIGINT, BIGINT) TO authenticated;

DROP POLICY IF EXISTS sms_sbfp_quality_responses_insert ON procurements.sms_sbfp_quality_responses;
CREATE POLICY sms_sbfp_quality_responses_insert ON procurements.sms_sbfp_quality_responses
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_can_file_quality(program_id));

DROP POLICY IF EXISTS sms_sbfp_quality_responses_update ON procurements.sms_sbfp_quality_responses;
CREATE POLICY sms_sbfp_quality_responses_update ON procurements.sms_sbfp_quality_responses
  FOR UPDATE TO authenticated
  USING (procurements.sbfp_can_edit_quality(program_id, created_by))
  WITH CHECK (procurements.sbfp_can_edit_quality(program_id, created_by));

DROP POLICY IF EXISTS sms_sbfp_quality_responses_delete ON procurements.sms_sbfp_quality_responses;
CREATE POLICY sms_sbfp_quality_responses_delete ON procurements.sms_sbfp_quality_responses
  FOR DELETE TO authenticated
  USING (procurements.sbfp_can_edit_quality(program_id, created_by));

-- Feeding days: 210's policy named the teacher directly, not through a helper.
DROP POLICY IF EXISTS sbfp_feeding_days_insert ON procurements.sms_sbfp_feeding_days;
CREATE POLICY sbfp_feeding_days_insert ON procurements.sms_sbfp_feeding_days
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_can_manage(program_id));

-- ------------------------------------------------------------------ Part B ---

ALTER TABLE procurements.sms_sbfp_kitchen_logs
  ADD COLUMN IF NOT EXISTS kitchen_barangay TEXT;

-- One place only: a centralized kitchen, or a barangay, or neither (at school site).
ALTER TABLE procurements.sms_sbfp_kitchen_logs
  DROP CONSTRAINT IF EXISTS sms_sbfp_kitchen_logs_barangay_check;
ALTER TABLE procurements.sms_sbfp_kitchen_logs
  ADD CONSTRAINT sms_sbfp_kitchen_logs_barangay_check CHECK (
    kitchen_barangay IS NULL
    OR (kitchen_id IS NULL AND btrim(kitchen_barangay) <> '')
  );
