-- ============================================================================
-- 210 — SBFP: A TEACHER SEES AND EDITS ONLY THE RECORDS THEY ENCODED
-- ============================================================================
-- 209 let anyone signed in read every beneficiary, weighing and feeding record,
-- and let only the adviser of a section encode it, after a school head had
-- opened the programme. The rule asked for instead:
--
--   * every teacher (teacher, volunteer_teacher) at the school may encode
--     beneficiaries, from any section of their active school;
--   * a teacher sees and edits ONLY the beneficiaries they encoded, together
--     with those learners' weighings and daily feeding records;
--   * the first person to use the module opens the school's programme for the
--     school year; the school head fills in the header later.
--
-- Unchanged: the school head, assistant school head, admin, school nurse and
-- the designated focal person (sbfp_can_manage) see and edit everything at
-- their school; super admin everything; the division office reads everything.
-- Registrar and librarian keep reading their own school's programme. One
-- programme per school per school year, so the forms still compile together.
--
-- ---------------------------------------------------------------------------
-- Ownership is created_by, stamped by the database
-- ---------------------------------------------------------------------------
-- sms_sbfp_beneficiaries.created_by (209) is the owner. A BEFORE INSERT
-- trigger overwrites it with the caller's sms_users.id, so it cannot be
-- forged from the browser (the anon key ships in the bundle; the 161 lesson),
-- and the update guard refuses changing it except by a manager. Weighings and
-- feeding records follow their beneficiary.
--
-- Rows created before this migration keep whatever created_by they carry.
-- 209 has been live only briefly; any row encoded by an adviser already has
-- that adviser's id, and a row with NULL created_by is visible to managers only.
--
--   -- Rows a teacher will no longer see because they did not encode them:
--   SELECT count(*) FROM procurements.sms_sbfp_beneficiaries WHERE created_by IS NULL;
--
-- ---------------------------------------------------------------------------
-- A learner already taken by another teacher
-- ---------------------------------------------------------------------------
-- UNIQUE(program_id, student_id) stays: a learner is one beneficiary. A teacher
-- cannot read a colleague's row, so sbfp_taken_students() tells the screen
-- which learners of a section are already beneficiaries under someone else,
-- returning student ids only and nothing about the record.
--
-- ---------------------------------------------------------------------------
-- Feeding days
-- ---------------------------------------------------------------------------
-- Feeding days stay programme-wide (Form 1B's denominator). A teacher may ADD
-- a feeding day, since with no head involved they would otherwise have no way
-- to record a meal; only a manager may remove one.
--
-- Touches: three functions replaced (same signatures), four added, three
-- triggers added, and the policies on four SBFP tables replaced. No table or
-- column created or dropped, no DML.
-- ============================================================================

SET search_path TO procurements, public;

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
-- A teacher whose active school is the programme's school.
CREATE OR REPLACE FUNCTION procurements.sbfp_is_school_teacher(p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM procurements.sms_users u
     WHERE u.user_id = auth.uid()
       AND u.is_active
       AND u.type IN ('teacher', 'volunteer_teacher')
       AND u.school_id = p_school_id
  );
$$;

-- Who may open the school's programme: a manager or a teacher of the school.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_open(p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT procurements.sbfp_can_manage_school(p_school_id)
      OR procurements.sbfp_is_school_teacher(p_school_id);
$$;

-- Who may read every record of the programme: managers, the school's
-- registrar and librarian, and the division office.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_view_all(p_program_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id)
      OR EXISTS (
        SELECT 1
          FROM procurements.sms_sbfp_programs p
          JOIN procurements.sms_users u ON u.user_id = auth.uid()
         WHERE p.id = p_program_id
           AND u.is_active
           AND (
             u.type IN ('division_admin', 'division_type')
             OR (u.type IN ('registrar', 'librarian') AND u.school_id = p.school_id)
           )
      );
$$;

-- 209's name, new rule: may this user CREATE a beneficiary in this section?
-- A manager, or any teacher of the school, for a section of that school.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_record(
  p_program_id BIGINT,
  p_section_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id)
      OR EXISTS (
        SELECT 1
          FROM procurements.sms_sbfp_programs p
          JOIN procurements.sms_sections sec ON sec.id = p_section_id
         WHERE p.id = p_program_id
           AND sec.school_id = p.school_id
           AND procurements.sbfp_is_school_teacher(p.school_id)
      );
$$;

-- 209's name, new rule: may this user EDIT this beneficiary and its weighings
-- and feeding? A manager, or the teacher who encoded it, while at that school.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_record_beneficiary(p_beneficiary_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM procurements.sms_sbfp_beneficiaries b
      JOIN procurements.sms_sbfp_programs p ON p.id = b.program_id
     WHERE b.id = p_beneficiary_id
       AND (
         procurements.sbfp_can_manage(b.program_id)
         OR EXISTS (
           SELECT 1
             FROM procurements.sms_users u
            WHERE u.user_id = auth.uid()
              AND u.is_active
              AND u.id = b.created_by
              AND u.school_id = p.school_id
         )
       )
  );
$$;

-- May this user SEE this beneficiary? Everyone who may edit it, plus the
-- read-all roles.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_view_beneficiary(p_beneficiary_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT procurements.sbfp_can_record_beneficiary(p_beneficiary_id)
      OR EXISTS (
        SELECT 1
          FROM procurements.sms_sbfp_beneficiaries b
         WHERE b.id = p_beneficiary_id
           AND procurements.sbfp_can_view_all(b.program_id)
      );
$$;

-- Learners of a section already beneficiaries under someone else's record.
-- Student ids only: enough to grey out a checkbox, nothing about the record.
CREATE OR REPLACE FUNCTION procurements.sbfp_taken_students(
  p_program_id BIGINT,
  p_section_id BIGINT
)
RETURNS SETOF BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT b.student_id
    FROM procurements.sms_sbfp_beneficiaries b
   WHERE b.program_id = p_program_id
     AND b.section_id = p_section_id
     AND procurements.sbfp_can_record(p_program_id, p_section_id)
     AND NOT procurements.sbfp_can_record_beneficiary(b.id);
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_is_school_teacher(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_can_open(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_can_view_all(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_can_view_beneficiary(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_taken_students(BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_is_school_teacher(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_open(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_view_all(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_view_beneficiary(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_taken_students(BIGINT, BIGINT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Triggers
-- ---------------------------------------------------------------------------
-- A programme opened by a teacher carries no focal person: designating one is
-- a school-level manager's decision (209's update guard), and a teacher must
-- not be able to name themselves while opening it.
CREATE OR REPLACE FUNCTION procurements.sbfp_guard_program_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT procurements.sbfp_can_manage_school(NEW.school_id) THEN
    NEW.focal_person_id := NULL;
    NEW.focal_person_name := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sbfp_guard_program_insert ON procurements.sms_sbfp_programs;
CREATE TRIGGER sbfp_guard_program_insert
  BEFORE INSERT ON procurements.sms_sbfp_programs
  FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_guard_program_insert();

-- The owner is whoever inserts the row, never what the payload says.
CREATE OR REPLACE FUNCTION procurements.sbfp_stamp_beneficiary_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_actor BIGINT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT u.id INTO v_actor FROM procurements.sms_users u WHERE u.user_id = auth.uid();
    NEW.created_by := v_actor;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sbfp_stamp_beneficiary_owner ON procurements.sms_sbfp_beneficiaries;
CREATE TRIGGER sbfp_stamp_beneficiary_owner
  BEFORE INSERT ON procurements.sms_sbfp_beneficiaries
  FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_stamp_beneficiary_owner();

-- 209's guard, plus: only a manager may hand a record to someone else.
CREATE OR REPLACE FUNCTION procurements.sbfp_guard_beneficiary_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF NEW.program_id IS DISTINCT FROM OLD.program_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id THEN
    RAISE EXCEPTION 'A beneficiary cannot be moved to another programme or learner.';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND auth.uid() IS NOT NULL
     AND NOT procurements.sbfp_can_manage(NEW.program_id) THEN
    RAISE EXCEPTION 'Only the school head, admin, school nurse or focal person may reassign a beneficiary record.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_guard_program_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_stamp_beneficiary_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_guard_beneficiary_update() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------
-- Programmes: a teacher may open one; editing it stays with managers (209).
DROP POLICY IF EXISTS "sbfp_programs_insert" ON procurements.sms_sbfp_programs;
CREATE POLICY "sbfp_programs_insert" ON procurements.sms_sbfp_programs
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_can_open(school_id));

-- Beneficiaries
DROP POLICY IF EXISTS "sbfp_beneficiaries_select" ON procurements.sms_sbfp_beneficiaries;
CREATE POLICY "sbfp_beneficiaries_select" ON procurements.sms_sbfp_beneficiaries
  FOR SELECT TO authenticated
  USING (procurements.sbfp_can_view_beneficiary(id));
DROP POLICY IF EXISTS "sbfp_beneficiaries_insert" ON procurements.sms_sbfp_beneficiaries;
CREATE POLICY "sbfp_beneficiaries_insert" ON procurements.sms_sbfp_beneficiaries
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_can_record(program_id, section_id));
DROP POLICY IF EXISTS "sbfp_beneficiaries_update" ON procurements.sms_sbfp_beneficiaries;
CREATE POLICY "sbfp_beneficiaries_update" ON procurements.sms_sbfp_beneficiaries
  FOR UPDATE TO authenticated
  USING (procurements.sbfp_can_record_beneficiary(id))
  WITH CHECK (procurements.sbfp_can_record(program_id, section_id));
DROP POLICY IF EXISTS "sbfp_beneficiaries_delete" ON procurements.sms_sbfp_beneficiaries;
CREATE POLICY "sbfp_beneficiaries_delete" ON procurements.sms_sbfp_beneficiaries
  FOR DELETE TO authenticated
  USING (procurements.sbfp_can_record_beneficiary(id));

-- Weighings
DROP POLICY IF EXISTS "sbfp_measurements_select" ON procurements.sms_sbfp_measurements;
CREATE POLICY "sbfp_measurements_select" ON procurements.sms_sbfp_measurements
  FOR SELECT TO authenticated
  USING (procurements.sbfp_can_view_beneficiary(beneficiary_id));
-- sbfp_measurements_write (209) already reads sbfp_can_record_beneficiary,
-- whose body is replaced above.

-- Feeding records
DROP POLICY IF EXISTS "sbfp_feeding_records_select" ON procurements.sms_sbfp_feeding_records;
CREATE POLICY "sbfp_feeding_records_select" ON procurements.sms_sbfp_feeding_records
  FOR SELECT TO authenticated
  USING (procurements.sbfp_can_view_beneficiary(beneficiary_id));
-- Insert / update / delete (209) read sbfp_can_record_beneficiary: replaced above.

-- Feeding days: a teacher may add one; only a manager removes one.
DROP POLICY IF EXISTS "sbfp_feeding_days_insert" ON procurements.sms_sbfp_feeding_days;
CREATE POLICY "sbfp_feeding_days_insert" ON procurements.sms_sbfp_feeding_days
  FOR INSERT TO authenticated
  WITH CHECK (
    procurements.sbfp_can_manage(program_id)
    OR EXISTS (
      SELECT 1 FROM procurements.sms_sbfp_programs p
       WHERE p.id = program_id
         AND procurements.sbfp_is_school_teacher(p.school_id)
    )
  );

-- Verification: the Supabase SQL editor shows only this last result.
SELECT c.relname AS table_name, p.polname AS policy, p.polcmd AS command
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname IN ('sms_sbfp_programs', 'sms_sbfp_beneficiaries',
                     'sms_sbfp_measurements', 'sms_sbfp_feeding_records',
                     'sms_sbfp_feeding_days')
 ORDER BY 1, 2;
