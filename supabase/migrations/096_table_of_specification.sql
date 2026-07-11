-- ============================================================================
-- TOS — Table of Specification (DepEd quarterly/term examinations)
--
-- A TOS distributes exam items across the Most Essential Learning Competencies
-- (MELCs) and Bloom's cognitive levels, weighted by teaching time. One TOS is
-- targeted per subject + grade level + school year + grading period.
--
-- Authoring is dual-level (mirrors the assessment materials pattern, but with a
-- twist): `school_id` is NULLABLE.
--   * school_id IS NULL  -> DIVISION-authored, shared/visible to ALL teachers.
--   * school_id set       -> TEACHER-authored, private to `created_by`.
-- Visibility is enforced in the app layer (matching sms_crla_* / sms_mps).
--
-- Item placement (`sms_tos_items`) is stored per exam item number so the future
-- Exam Creator and Item Analysis modules can build on it without a redesign.
--
-- Grading period count/labels are derived from the school year in the app layer
-- (3 terms for SY >= 2026-2027, else 4 quarters); the column allows 1-4.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. TOS (header) — one per subject/grade/school-year/period
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_tos (
  id BIGSERIAL PRIMARY KEY,
  title TEXT,                                    -- optional custom title; else generated in UI
  subject_name TEXT NOT NULL,                    -- e.g. "EPP" / "Mathematics" (matched across schools)
  grade_level INTEGER NOT NULL,                  -- K=0 .. 12
  subject_id BIGINT REFERENCES procurements.sms_subjects(id) ON DELETE SET NULL, -- optional link (teacher-authored)
  school_year TEXT NOT NULL,
  grading_period INTEGER NOT NULL CHECK (grading_period BETWEEN 1 AND 4),
  exam_type TEXT NOT NULL DEFAULT 'Quarterly Examination',
  total_items INTEGER NOT NULL DEFAULT 40 CHECK (total_items > 0),
  total_days NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (total_days >= 0), -- instructional days for the term (drives item counts)
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE, -- NULL = division-authored (shared)
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  prepared_by_name TEXT,
  prepared_by_position TEXT,
  legend TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_tos IS
  'Table of Specification header. school_id NULL = division-authored (shared to all teachers); set = teacher-private.';

CREATE INDEX IF NOT EXISTS idx_sms_tos_school       ON procurements.sms_tos(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_tos_created_by   ON procurements.sms_tos(created_by);
CREATE INDEX IF NOT EXISTS idx_sms_tos_subject      ON procurements.sms_tos(subject_name, grade_level);
CREATE INDEX IF NOT EXISTS idx_sms_tos_sy_period    ON procurements.sms_tos(school_year, grading_period);

CREATE TRIGGER update_sms_tos_updated_at
  BEFORE UPDATE ON procurements.sms_tos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. TOS COMPETENCIES (MELC rows) — days -> %/no_of_items (computed app-side)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_tos_competencies (
  id BIGSERIAL PRIMARY KEY,
  tos_id BIGINT NOT NULL REFERENCES procurements.sms_tos(id) ON DELETE CASCADE,
  competency_text TEXT NOT NULL,
  lc_code TEXT,
  no_of_days NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (no_of_days >= 0),
  no_of_items INTEGER NOT NULL DEFAULT 0 CHECK (no_of_items >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_tos_competencies IS
  'MELC rows of a TOS; no_of_items auto-computed from no_of_days (override-able).';

CREATE INDEX IF NOT EXISTS idx_sms_tos_competencies_tos
  ON procurements.sms_tos_competencies(tos_id, position);

CREATE TRIGGER update_sms_tos_competencies_updated_at
  BEFORE UPDATE ON procurements.sms_tos_competencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. TOS ITEMS (item placement) — one row per exam item number
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_tos_items (
  id BIGSERIAL PRIMARY KEY,
  tos_id BIGINT NOT NULL REFERENCES procurements.sms_tos(id) ON DELETE CASCADE,
  competency_id BIGINT NOT NULL REFERENCES procurements.sms_tos_competencies(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL CHECK (item_number > 0),
  cognitive_level TEXT NOT NULL CHECK (cognitive_level IN (
    'remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tos_id, item_number)
);

COMMENT ON TABLE procurements.sms_tos_items IS
  'Item-placement grid: each exam item number mapped to a competency + Bloom cognitive level.';

CREATE INDEX IF NOT EXISTS idx_sms_tos_items_tos        ON procurements.sms_tos_items(tos_id);
CREATE INDEX IF NOT EXISTS idx_sms_tos_items_competency ON procurements.sms_tos_items(competency_id);

CREATE TRIGGER update_sms_tos_items_updated_at
  BEFORE UPDATE ON procurements.sms_tos_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. RLS + GRANTS (permissive; scoping enforced in the app layer)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_tos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_tos_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_tos_items        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_tos', 'sms_tos_competencies', 'sms_tos_items'
  ] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
