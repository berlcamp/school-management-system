-- ============================================================================
-- Anecdotal Record + Learner Cardex — class-adviser tools
--
-- Three per-learner dated-entry logs kept by class advisers, modeled on the
-- ARAL tutor tools (migration 104) but scoped to the adviser's advisory-section
-- learners (sms_enrollments) instead of ARAL enrollments:
--
--   1. Anecdotal Record (sms_anecdotal_records) — dated, objective behavior
--      observations with the adviser's interpretation + action taken.
--
--   2. Learner Cardex, sheet 1 — Needs, Progress & Achievement
--      (sms_cardex_needs): identified need, intervention, progress/achievement.
--
--   3. Learner Cardex, sheet 2 — Parent/Guardian Communication
--      (sms_cardex_communication): mode, person contacted, purpose, outcome.
--
-- Each row references the STUDENT (so the log follows the learner, cumulatively)
-- and records created_by for attribution. Roster + scoping are enforced in the
-- app layer (RLS = authenticated), matching sms_aral_* and the assessment
-- modules. There is no per-row ownership check in Postgres.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. ANECDOTAL RECORD — one row per observation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_anecdotal_records (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  observation_date DATE NOT NULL,
  setting TEXT,                       -- place/context, e.g. 'Classroom', 'Playground'
  incident TEXT NOT NULL,             -- observed behavior (objective anecdote)
  interpretation TEXT,                -- adviser's interpretation / analysis
  action_taken TEXT,                  -- recommendation / action taken
  created_by BIGINT REFERENCES procurements.sms_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_anecdotal_records IS
  'Class-adviser anecdotal records; one row per dated behavior observation per learner.';

CREATE INDEX IF NOT EXISTS idx_sms_anecdotal_records_scope
  ON procurements.sms_anecdotal_records(student_id, school_year);

CREATE TRIGGER update_sms_anecdotal_records_updated_at
  BEFORE UPDATE ON procurements.sms_anecdotal_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. CARDEX — Needs, Progress & Achievement
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_cardex_needs (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  entry_date DATE NOT NULL,
  need TEXT NOT NULL,                 -- learner's need / area of concern
  intervention TEXT,                  -- intervention / strategy applied
  progress TEXT,                      -- progress & achievement
  remarks TEXT,
  created_by BIGINT REFERENCES procurements.sms_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_cardex_needs IS
  'Learner Cardex sheet: needs, progress & achievement; one row per dated entry per learner.';

CREATE INDEX IF NOT EXISTS idx_sms_cardex_needs_scope
  ON procurements.sms_cardex_needs(student_id, school_year);

CREATE TRIGGER update_sms_cardex_needs_updated_at
  BEFORE UPDATE ON procurements.sms_cardex_needs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. CARDEX — Parent/Guardian Communication
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_cardex_communication (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  communication_date DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN (
    'phone_call', 'text_sms', 'messenger', 'home_visit', 'conference', 'letter', 'other'
  )),
  person_contacted TEXT,             -- parent/guardian name + relationship
  purpose TEXT NOT NULL,             -- purpose / concern discussed
  outcome TEXT,                      -- agreement / action taken
  created_by BIGINT REFERENCES procurements.sms_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_cardex_communication IS
  'Learner Cardex sheet: parent/guardian communication log; one row per dated contact per learner.';

CREATE INDEX IF NOT EXISTS idx_sms_cardex_communication_scope
  ON procurements.sms_cardex_communication(student_id, school_year);

CREATE TRIGGER update_sms_cardex_communication_updated_at
  BEFORE UPDATE ON procurements.sms_cardex_communication
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- RLS + GRANTS (scoping enforced in the app layer)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_anecdotal_records',
    'sms_cardex_needs',
    'sms_cardex_communication'
  ] LOOP
    EXECUTE format('ALTER TABLE procurements.%1$s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
