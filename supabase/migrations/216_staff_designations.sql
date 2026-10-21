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
--    at the school (home school = sms_users.school_id, or a 134 assignment)
--    cannot be designated. Removing a Department
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
    SELECT 1 FROM procurements.sms_users u
    WHERE u.id = NEW.user_id AND u.school_id = NEW.school_id)
  AND NOT EXISTS (
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

-- =============================================================================
-- PART B — what the designations unlock: subjects, schedules, storage
-- =============================================================================
--
-- Policies REPLACED (each re-created from its live pg_policies definition on the
-- local clone, every existing branch kept verbatim, one OR branch added; the
-- UPDATE policies had no WITH CHECK live and still have none, so their USING —
-- new branch included — is applied to the new row as well):
--
--   procurements.sms_subjects
--     "Subjects are insertable by authorized roles"   + OR sms_has_designation('department_head', school_id)
--     "Subjects are updatable by authorized roles"    + OR sms_heads_subject(id)
--   procurements.sms_subject_schedules
--     "Subject schedules are insertable by authorized roles" + OR (sms_heads_subject(subject_id) AND school_id = the subject's school)
--     "Subject schedules are updatable by authorized roles"  + OR (same) OR sms_glc_covers(school_id, section's grade level)
--     "Subject schedules are deletable by authorized roles"  + OR (same as insert)
--   storage.objects (215's six, which the local clone does not carry — rebuilt
--   from 215's file verbatim)
--     "school_management crla|philiri insert|update|delete"  + OR the caller holds
--     reading_coordinator at their active school
--
-- Not touched: every SELECT policy, "Subjects are deletable by authorized roles"
-- (a Department Head may not delete a subject), and sms_sections — whose write
-- policies already admit any authenticated user (001), so the Grade Level
-- Coordinator's limit to section_adviser_id is app-layer, per the spec.
--
-- Column limits are triggers, because a policy cannot compare OLD with NEW.
-- They fire only when the designation is the caller's ONLY authority:
-- `sms_is_subject_roster()` mirrors the roster of the policies above, so a
-- school head, admin or registrar who is also a Department Head is never
-- narrowed, and a write with no caller (auth.uid() NULL: postgres, migrations,
-- service_role) is never narrowed either.
--
-- Idempotent: CREATE OR REPLACE, DROP ... IF EXISTS. No DML.
-- =============================================================================

-- Is the caller in the subjects/schedules write roster for p_school_id
-- (the 115 roster for INSERT/UPDATE, verbatim)?
CREATE OR REPLACE FUNCTION procurements.sms_is_subject_roster(p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar',
                     'division_admin', 'super admin')
      AND (u.type IN ('division_admin', 'super admin')
           OR (p_school_id IS NOT NULL AND u.school_id = p_school_id)));
$$;

REVOKE ALL ON FUNCTION procurements.sms_is_subject_roster(BIGINT) FROM PUBLIC, anon, authenticated;

-- A subject a Department Head creates is linked to them, so they can go on
-- editing it. SECURITY DEFINER because the link table's INSERT policy admits
-- designation managers only; its guard trigger still validates the link.
CREATE OR REPLACE FUNCTION procurements.sms_subjects_dh_autolink()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_user BIGINT;
BEGIN
  IF NEW.school_id IS NULL OR auth.uid() IS NULL
     OR NOT procurements.sms_has_designation('department_head', NEW.school_id) THEN
    RETURN NULL;
  END IF;
  SELECT u.id INTO v_user FROM procurements.sms_users u WHERE u.user_id = auth.uid();
  INSERT INTO procurements.sms_department_head_subjects (user_id, subject_id, school_id)
  VALUES (v_user, NEW.id, NEW.school_id)
  ON CONFLICT (user_id, subject_id) DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sms_subjects_dh_autolink ON procurements.sms_subjects;
CREATE TRIGGER sms_subjects_dh_autolink
  AFTER INSERT ON procurements.sms_subjects
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_subjects_dh_autolink();

-- A Department Head changes only code, name and description.
CREATE OR REPLACE FUNCTION procurements.sms_subjects_dh_column_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR procurements.sms_is_subject_roster(OLD.school_id) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['code', 'name', 'description', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['code', 'name', 'description', 'updated_at']) THEN
    RAISE EXCEPTION 'A Department Head may change only the code, name and description of a subject.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_subjects_dh_column_guard ON procurements.sms_subjects;
CREATE TRIGGER sms_subjects_dh_column_guard
  BEFORE UPDATE ON procurements.sms_subjects
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_subjects_dh_column_guard();

-- A Grade Level Coordinator changes only the teacher (and the 124 override that
-- a teacher change may need). A Department Head of the subject is not narrowed.
CREATE OR REPLACE FUNCTION procurements.sms_schedules_glc_column_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR procurements.sms_is_subject_roster(OLD.school_id)
     OR procurements.sms_heads_subject(OLD.subject_id) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['teacher_id', 'conflict_override', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['teacher_id', 'conflict_override', 'updated_at']) THEN
    RAISE EXCEPTION 'A Grade Level Coordinator may change only the teacher of a schedule.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_schedules_glc_column_guard ON procurements.sms_subject_schedules;
CREATE TRIGGER sms_schedules_glc_column_guard
  BEFORE UPDATE ON procurements.sms_subject_schedules
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_schedules_glc_column_guard();

REVOKE ALL ON FUNCTION procurements.sms_subjects_dh_autolink() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sms_subjects_dh_column_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sms_schedules_glc_column_guard() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------ sms_subjects --

DROP POLICY IF EXISTS "Subjects are insertable by authorized roles" ON procurements.sms_subjects;
CREATE POLICY "Subjects are insertable by authorized roles" ON procurements.sms_subjects
  FOR INSERT
  WITH CHECK (
    (auth.role() = 'authenticated'::text) AND (
      (EXISTS ( SELECT 1
         FROM procurements.sms_users u
        WHERE ((u.user_id = auth.uid())
          AND (u.type = ANY (ARRAY['school_head'::text, 'assistant_school_head'::text, 'admin'::text, 'registrar'::text, 'division_admin'::text, 'super admin'::text]))
          AND ((u.type = ANY (ARRAY['division_admin'::text, 'super admin'::text])) OR (u.school_id = sms_subjects.school_id)))))
      OR procurements.sms_has_designation('department_head', sms_subjects.school_id)));

DROP POLICY IF EXISTS "Subjects are updatable by authorized roles" ON procurements.sms_subjects;
CREATE POLICY "Subjects are updatable by authorized roles" ON procurements.sms_subjects
  FOR UPDATE
  USING (
    (auth.role() = 'authenticated'::text) AND (
      (EXISTS ( SELECT 1
         FROM procurements.sms_users u
        WHERE ((u.user_id = auth.uid())
          AND (u.type = ANY (ARRAY['school_head'::text, 'assistant_school_head'::text, 'admin'::text, 'registrar'::text, 'division_admin'::text, 'super admin'::text]))
          AND ((u.type = ANY (ARRAY['division_admin'::text, 'super admin'::text])) OR (u.school_id = sms_subjects.school_id)))))
      OR procurements.sms_heads_subject(sms_subjects.id)));

-- --------------------------------------------------- sms_subject_schedules --
-- The Department Head branch also pins the schedule to the subject's school,
-- so a schedule for a headed subject cannot be stamped with another school.

DROP POLICY IF EXISTS "Subject schedules are insertable by authorized roles" ON procurements.sms_subject_schedules;
CREATE POLICY "Subject schedules are insertable by authorized roles" ON procurements.sms_subject_schedules
  FOR INSERT
  WITH CHECK (
    (auth.role() = 'authenticated'::text) AND (
      (EXISTS ( SELECT 1
         FROM procurements.sms_users u
        WHERE ((u.user_id = auth.uid())
          AND (u.type = ANY (ARRAY['school_head'::text, 'assistant_school_head'::text, 'admin'::text, 'registrar'::text, 'division_admin'::text, 'super admin'::text]))
          AND ((u.type = ANY (ARRAY['division_admin'::text, 'super admin'::text])) OR (u.school_id = sms_subject_schedules.school_id)))))
      OR (procurements.sms_heads_subject(sms_subject_schedules.subject_id)
          AND sms_subject_schedules.school_id = (
            SELECT s.school_id FROM procurements.sms_subjects s
            WHERE s.id = sms_subject_schedules.subject_id))));

DROP POLICY IF EXISTS "Subject schedules are updatable by authorized roles" ON procurements.sms_subject_schedules;
CREATE POLICY "Subject schedules are updatable by authorized roles" ON procurements.sms_subject_schedules
  FOR UPDATE
  USING (
    (auth.role() = 'authenticated'::text) AND (
      (EXISTS ( SELECT 1
         FROM procurements.sms_users u
        WHERE ((u.user_id = auth.uid())
          AND (u.type = ANY (ARRAY['school_head'::text, 'assistant_school_head'::text, 'admin'::text, 'registrar'::text, 'division_admin'::text, 'super admin'::text]))
          AND ((u.type = ANY (ARRAY['division_admin'::text, 'super admin'::text])) OR (u.school_id = sms_subject_schedules.school_id)))))
      OR (procurements.sms_heads_subject(sms_subject_schedules.subject_id)
          AND sms_subject_schedules.school_id = (
            SELECT s.school_id FROM procurements.sms_subjects s
            WHERE s.id = sms_subject_schedules.subject_id))
      OR procurements.sms_glc_covers(
           sms_subject_schedules.school_id,
           (SELECT sec.grade_level::int FROM procurements.sms_sections sec
            WHERE sec.id = sms_subject_schedules.section_id))));

DROP POLICY IF EXISTS "Subject schedules are deletable by authorized roles" ON procurements.sms_subject_schedules;
CREATE POLICY "Subject schedules are deletable by authorized roles" ON procurements.sms_subject_schedules
  FOR DELETE
  USING (
    (auth.role() = 'authenticated'::text) AND (
      (EXISTS ( SELECT 1
         FROM procurements.sms_users u
        WHERE ((u.user_id = auth.uid())
          AND (u.type = ANY (ARRAY['school_head'::text, 'assistant_school_head'::text, 'admin'::text, 'division_admin'::text, 'super admin'::text]))
          AND ((u.type = ANY (ARRAY['division_admin'::text, 'super admin'::text])) OR (u.school_id = sms_subject_schedules.school_id)))))
      OR (procurements.sms_heads_subject(sms_subject_schedules.subject_id)
          AND sms_subject_schedules.school_id = (
            SELECT s.school_id FROM procurements.sms_subjects s
            WHERE s.id = sms_subject_schedules.subject_id))));

-- ----------------------------------------------------------------- storage --
-- 215's six policies, verbatim, plus the Reading Coordinator branch.

DROP POLICY IF EXISTS "school_management crla insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management crla update" ON storage.objects;
DROP POLICY IF EXISTS "school_management crla delete" ON storage.objects;
DROP POLICY IF EXISTS "school_management philiri insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management philiri update" ON storage.objects;
DROP POLICY IF EXISTS "school_management philiri delete" ON storage.objects;

DO $$
DECLARE
  prefix TEXT;
  label  TEXT;
  roles  TEXT := '''division_admin'', ''super admin'', ''school_head'', ''assistant_school_head'', ''admin''';
  rc     TEXT := 'EXISTS (
             SELECT 1 FROM procurements.sms_users u
             JOIN procurements.sms_staff_designations d
               ON d.user_id = u.id AND d.school_id = u.school_id
             WHERE u.user_id = auth.uid() AND d.designation = ''reading_coordinator''
           )';
BEGIN
  FOREACH prefix IN ARRAY ARRAY['crla-materials', 'philiri-materials'] LOOP
    label := split_part(prefix, '-', 1);

    EXECUTE format(
      'CREATE POLICY "school_management %1$s insert" ON storage.objects
         FOR INSERT TO authenticated
         WITH CHECK (
           bucket_id = ''school-management''
           AND split_part(name, ''/'', 1) = %2$L
           AND (EXISTS (
             SELECT 1 FROM procurements.sms_users u
             WHERE u.user_id = auth.uid() AND u.type IN (%3$s)
           ) OR %4$s)
         )', label, prefix, roles, rc);

    EXECUTE format(
      'CREATE POLICY "school_management %1$s update" ON storage.objects
         FOR UPDATE TO authenticated
         USING (
           bucket_id = ''school-management''
           AND split_part(name, ''/'', 1) = %2$L
           AND (EXISTS (
             SELECT 1 FROM procurements.sms_users u
             WHERE u.user_id = auth.uid() AND u.type IN (%3$s)
           ) OR %4$s)
         )', label, prefix, roles, rc);

    EXECUTE format(
      'CREATE POLICY "school_management %1$s delete" ON storage.objects
         FOR DELETE TO authenticated
         USING (
           bucket_id = ''school-management''
           AND split_part(name, ''/'', 1) = %2$L
           AND (EXISTS (
             SELECT 1 FROM procurements.sms_users u
             WHERE u.user_id = auth.uid() AND u.type IN (%3$s)
           ) OR %4$s)
         )', label, prefix, roles, rc);
  END LOOP;
END $$;
