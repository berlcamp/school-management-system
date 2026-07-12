-- ============================================================================
-- ARAL — Tutors
--
-- Adds a lightweight "tutor" login role for the ARAL intervention program.
-- A tutor is an sms_users row (type = 'tutor') created from the ARAL > Tutors
-- page; they sign in via the same Google email match as all staff, and see only
-- the learners assigned to them. Assignment happens on two levels:
--   * sms_aral_tutors      — the tutor's assigned program + section (metadata)
--   * sms_aral_enrollments.tutor_id — the specific learners handed to the tutor
--
-- Scoping is enforced in the app layer (RLS is `authenticated`), matching the
-- ARAL enrollment table and the assessment modules.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. Allow the 'tutor' user type
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check
  CHECK (type IN (
    'school_head', 'assistant_school_head', 'teacher', 'registrar',
    'admin', 'super admin', 'division_admin', 'division_type',
    'librarian', 'tutor'
  ));

-- ----------------------------------------------------------------------------
-- 2. Per-learner tutor assignment on the ARAL roster
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_aral_enrollments
  ADD COLUMN IF NOT EXISTS tutor_id BIGINT
  REFERENCES procurements.sms_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sms_aral_enrollments_tutor
  ON procurements.sms_aral_enrollments(tutor_id);

-- ----------------------------------------------------------------------------
-- 3. Tutor assignment metadata (tutor -> program + grade level)
-- ----------------------------------------------------------------------------
-- Dropped-and-recreated so this migration re-runs cleanly even if an earlier
-- draft created the table with a different shape (e.g. a section_id column).
-- This table is new in 102 and holds no critical data, so a rebuild is safe.
DROP TABLE IF EXISTS procurements.sms_aral_tutors CASCADE;

CREATE TABLE IF NOT EXISTS procurements.sms_aral_tutors (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  program TEXT NOT NULL CHECK (program IN ('reading', 'mathematics', 'science', 'summer')),
  grade_level INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, program, grade_level)
);

COMMENT ON TABLE procurements.sms_aral_tutors IS
  'ARAL tutor assignments; links a tutor (sms_users) to a program and grade level.';

CREATE INDEX IF NOT EXISTS idx_sms_aral_tutors_scope
  ON procurements.sms_aral_tutors(school_id, program, grade_level);
CREATE INDEX IF NOT EXISTS idx_sms_aral_tutors_user
  ON procurements.sms_aral_tutors(user_id);

CREATE TRIGGER update_sms_aral_tutors_updated_at
  BEFORE UPDATE ON procurements.sms_aral_tutors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- RLS + GRANTS (scoping enforced in the app layer)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_aral_tutors ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_aral_tutors'] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
