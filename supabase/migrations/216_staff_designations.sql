-- =============================================================================
-- 216 — Staff designations: coordinators and heads layered on teacher accounts
-- =============================================================================
--
-- PART A — tables, helpers and the RLS that governs who may hand designations
-- out. (Part B, appended below in a later step, applies the designations to the
-- modules they unlock.)
--
-- A school names four kinds of coordinator from among its teachers: an ARAL
-- Coordinator, a Reading Coordinator, a Department Head (over particular
-- subjects) and a Grade Level Coordinator (over particular grade levels). None
-- of them is a login role — the person stays a `teacher` and `sms_users.type`
-- is untouched (invariant 12) — so this is a designation, in the 121 sense of
-- "observers are a designation, not a role".
--
-- 1. `sms_staff_designations` — one row per (user, school, designation).
--    `designation` is CHECK-constrained to the four keys because each value
--    carries behaviour (133/153); `grade_levels` is required for a Grade Level
--    Coordinator and forbidden for the rest, by a CHECK.
-- 2. `sms_department_head_subjects` — the subjects a Department Head oversees.
--    `school_id` is copied from the subject by trigger, and a link needs a
--    `department_head` designation at that school first.
-- 3. Helpers (SECURITY DEFINER, pinned search_path) resolve the caller as the
--    active `sms_users` row and test the designation against the ACTIVE school
--    (invariant 13): switched to another school, a designation held at the
--    first stops counting.
-- 4. Writes: the school's head, assistant head or admin at their active school,
--    plus super admin and division_admin. SELECT is open to authenticated.
-- 5. Guards: the login-disabled personnel roles (135/158) and anyone not
--    assigned to the school (134) cannot be designated. Removing a Department
--    Head designation removes that person's subject links at that school.
--
-- Idempotent: safe to re-apply. No DML on existing rows; no existing table,
-- policy, trigger or function is touched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS procurements.sms_staff_designations (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  school_id    BIGINT NOT NULL,
  designation  TEXT NOT NULL,
  grade_levels INTEGER[],
  created_by   BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_staff_designations_designation_check CHECK (designation IN (
    'aral_coordinator', 'reading_coordinator', 'department_head', 'grade_level_coordinator')),
  CONSTRAINT sms_staff_designations_grade_levels_check CHECK (
    (designation = 'grade_level_coordinator')
      = (grade_levels IS NOT NULL AND cardinality(grade_levels) > 0)),
  CONSTRAINT sms_staff_designations_unique UNIQUE (user_id, school_id, designation)
);

CREATE TABLE IF NOT EXISTS procurements.sms_department_head_subjects (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  school_id  BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_department_head_subjects_unique UNIQUE (user_id, subject_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sms_staff_designations_user') THEN
    ALTER TABLE procurements.sms_staff_designations
      ADD CONSTRAINT fk_sms_staff_designations_user
      FOREIGN KEY (user_id) REFERENCES procurements.sms_users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sms_staff_designations_school') THEN
    ALTER TABLE procurements.sms_staff_designations
      ADD CONSTRAINT fk_sms_staff_designations_school
      FOREIGN KEY (school_id) REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sms_dh_subjects_user') THEN
    ALTER TABLE procurements.sms_department_head_subjects
      ADD CONSTRAINT fk_sms_dh_subjects_user
      FOREIGN KEY (user_id) REFERENCES procurements.sms_users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sms_dh_subjects_subject') THEN
    ALTER TABLE procurements.sms_department_head_subjects
      ADD CONSTRAINT fk_sms_dh_subjects_subject
      FOREIGN KEY (subject_id) REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_staff_designations_school
  ON procurements.sms_staff_designations (school_id, designation);
CREATE INDEX IF NOT EXISTS idx_sms_dh_subjects_subject
  ON procurements.sms_department_head_subjects (subject_id);

-- ------------------------------------------------------------------ helpers --

-- Does the caller hold this designation at p_school_id, and are they working
-- at that school right now?
CREATE OR REPLACE FUNCTION procurements.sms_has_designation(
  p_designation TEXT, p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_users u
    JOIN procurements.sms_staff_designations d
      ON d.user_id = u.id AND d.school_id = u.school_id
    WHERE u.user_id = auth.uid()
      AND u.is_active
      AND u.school_id = p_school_id
      AND d.designation = p_designation);
$$;

-- Does the caller head this subject (Department Head, at the subject's school)?
CREATE OR REPLACE FUNCTION procurements.sms_heads_subject(p_subject_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_users u
    JOIN procurements.sms_department_head_subjects l ON l.user_id = u.id
    JOIN procurements.sms_staff_designations d
      ON d.user_id = u.id AND d.school_id = l.school_id
     AND d.designation = 'department_head'
    WHERE u.user_id = auth.uid()
      AND u.is_active
      AND l.subject_id = p_subject_id
      AND u.school_id = l.school_id);
$$;

-- Does the caller coordinate this grade level at p_school_id?
CREATE OR REPLACE FUNCTION procurements.sms_glc_covers(
  p_school_id BIGINT, p_grade_level INTEGER)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_users u
    JOIN procurements.sms_staff_designations d
      ON d.user_id = u.id AND d.school_id = u.school_id
    WHERE u.user_id = auth.uid()
      AND u.is_active
      AND u.school_id = p_school_id
      AND d.designation = 'grade_level_coordinator'
      AND p_grade_level = ANY (d.grade_levels));
$$;

-- Who may hand designations out at p_school_id: the school head, assistant head
-- or admin working at that school, plus super admin / division_admin.
CREATE OR REPLACE FUNCTION procurements.sms_may_manage_designations(p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND u.is_active
      AND (
        u.type IN ('super admin', 'division_admin')
        OR (u.type IN ('school_head', 'assistant_school_head', 'admin')
            AND u.school_id IS NOT NULL
            AND u.school_id = p_school_id)));
$$;

REVOKE ALL ON FUNCTION procurements.sms_has_designation(TEXT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sms_heads_subject(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sms_glc_covers(BIGINT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sms_may_manage_designations(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sms_has_designation(TEXT, BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.sms_heads_subject(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.sms_glc_covers(BIGINT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.sms_may_manage_designations(BIGINT) TO authenticated, service_role;

-- ------------------------------------------------------------------- guards --

CREATE OR REPLACE FUNCTION procurements.sms_staff_designations_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT u.type INTO v_type FROM procurements.sms_users u WHERE u.id = NEW.user_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'User % does not exist.', NEW.user_id;
  END IF;
  IF v_type IN ('accounting', 'security_guard', 'utility_worker') THEN
    RAISE EXCEPTION 'A % cannot be designated: personnel-record roles hold no account.', v_type;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM procurements.sms_user_schools s
    WHERE s.user_id = NEW.user_id AND s.school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'User % is not assigned to school % and cannot be designated there.',
      NEW.user_id, NEW.school_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_staff_designations_guard ON procurements.sms_staff_designations;
CREATE TRIGGER sms_staff_designations_guard
  BEFORE INSERT OR UPDATE ON procurements.sms_staff_designations
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_staff_designations_guard();

CREATE OR REPLACE FUNCTION procurements.sms_dh_subjects_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_school BIGINT;
BEGIN
  SELECT s.school_id INTO v_school FROM procurements.sms_subjects s WHERE s.id = NEW.subject_id;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Subject % does not belong to a school.', NEW.subject_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM procurements.sms_staff_designations d
    WHERE d.user_id = NEW.user_id AND d.school_id = v_school
      AND d.designation = 'department_head') THEN
    RAISE EXCEPTION 'User % is not a Department Head at the subject''s school.', NEW.user_id;
  END IF;
  NEW.school_id := v_school;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_dh_subjects_guard ON procurements.sms_department_head_subjects;
CREATE TRIGGER sms_dh_subjects_guard
  BEFORE INSERT OR UPDATE ON procurements.sms_department_head_subjects
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_dh_subjects_guard();

-- Losing the Department Head designation takes the subject links with it.
CREATE OR REPLACE FUNCTION procurements.sms_dh_links_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF OLD.designation = 'department_head' THEN
    DELETE FROM procurements.sms_department_head_subjects l
    WHERE l.user_id = OLD.user_id AND l.school_id = OLD.school_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sms_dh_links_cleanup_delete ON procurements.sms_staff_designations;
CREATE TRIGGER sms_dh_links_cleanup_delete
  AFTER DELETE ON procurements.sms_staff_designations
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_dh_links_cleanup();

DROP TRIGGER IF EXISTS sms_dh_links_cleanup_update ON procurements.sms_staff_designations;
CREATE TRIGGER sms_dh_links_cleanup_update
  AFTER UPDATE ON procurements.sms_staff_designations
  FOR EACH ROW
  WHEN (OLD.designation = 'department_head' AND NEW.designation IS DISTINCT FROM OLD.designation)
  EXECUTE FUNCTION procurements.sms_dh_links_cleanup();

REVOKE ALL ON FUNCTION procurements.sms_staff_designations_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sms_dh_subjects_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sms_dh_links_cleanup() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------- RLS --

ALTER TABLE procurements.sms_staff_designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_department_head_subjects ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_staff_designations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_department_head_subjects TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_staff_designations_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_department_head_subjects_id_seq TO authenticated;

DROP POLICY IF EXISTS sms_staff_designations_select ON procurements.sms_staff_designations;
CREATE POLICY sms_staff_designations_select ON procurements.sms_staff_designations
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS sms_staff_designations_insert ON procurements.sms_staff_designations;
CREATE POLICY sms_staff_designations_insert ON procurements.sms_staff_designations
  FOR INSERT TO authenticated WITH CHECK (procurements.sms_may_manage_designations(school_id));
DROP POLICY IF EXISTS sms_staff_designations_update ON procurements.sms_staff_designations;
CREATE POLICY sms_staff_designations_update ON procurements.sms_staff_designations
  FOR UPDATE TO authenticated
  USING (procurements.sms_may_manage_designations(school_id))
  WITH CHECK (procurements.sms_may_manage_designations(school_id));
DROP POLICY IF EXISTS sms_staff_designations_delete ON procurements.sms_staff_designations;
CREATE POLICY sms_staff_designations_delete ON procurements.sms_staff_designations
  FOR DELETE TO authenticated USING (procurements.sms_may_manage_designations(school_id));

DROP POLICY IF EXISTS sms_dh_subjects_select ON procurements.sms_department_head_subjects;
CREATE POLICY sms_dh_subjects_select ON procurements.sms_department_head_subjects
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS sms_dh_subjects_insert ON procurements.sms_department_head_subjects;
CREATE POLICY sms_dh_subjects_insert ON procurements.sms_department_head_subjects
  FOR INSERT TO authenticated WITH CHECK (procurements.sms_may_manage_designations(school_id));
DROP POLICY IF EXISTS sms_dh_subjects_update ON procurements.sms_department_head_subjects;
CREATE POLICY sms_dh_subjects_update ON procurements.sms_department_head_subjects
  FOR UPDATE TO authenticated
  USING (procurements.sms_may_manage_designations(school_id))
  WITH CHECK (procurements.sms_may_manage_designations(school_id));
DROP POLICY IF EXISTS sms_dh_subjects_delete ON procurements.sms_department_head_subjects;
CREATE POLICY sms_dh_subjects_delete ON procurements.sms_department_head_subjects
  FOR DELETE TO authenticated USING (procurements.sms_may_manage_designations(school_id));

-- PART B (module policies that honour these designations) is appended below.
