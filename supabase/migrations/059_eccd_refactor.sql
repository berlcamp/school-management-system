-- ============================================================================
-- ECCD CHECKLIST REFACTOR
-- ============================================================================
-- Changes the ECCD rating system from a 1-3 scale to checkbox (0/1),
-- switches periods from BOSY/MOSY/EOSY to 1ST_SEM/2ND_SEM,
-- adds scale score mappings per domain, and enables CRUD on reference tables.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- 1. NEW TABLE: sms_eccd_scale_scores
-- Maps raw scores to scale scores per domain.
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_eccd_scale_scores (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES procurements.sms_eccd_domains(id) ON DELETE CASCADE,
  raw_score INTEGER NOT NULL CHECK (raw_score >= 0),
  scale_score NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_id, raw_score)
);

CREATE INDEX IF NOT EXISTS idx_eccd_scale_scores_domain
  ON procurements.sms_eccd_scale_scores(domain_id);

CREATE TRIGGER update_sms_eccd_scale_scores_updated_at
  BEFORE UPDATE ON procurements.sms_eccd_scale_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_eccd_scale_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ECCD scale scores viewable by authenticated"
  ON procurements.sms_eccd_scale_scores FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "ECCD scale scores insertable by authenticated"
  ON procurements.sms_eccd_scale_scores FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "ECCD scale scores updatable by authenticated"
  ON procurements.sms_eccd_scale_scores FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "ECCD scale scores deletable by authenticated"
  ON procurements.sms_eccd_scale_scores FOR DELETE
  USING (auth.role() = 'authenticated');

COMMENT ON TABLE procurements.sms_eccd_scale_scores IS 'Raw score to scale score mapping per ECCD domain';

-- ============================================================================
-- 2. ADD CRUD POLICIES ON DOMAINS AND COMPETENCIES
-- (Currently SELECT-only; need INSERT/UPDATE/DELETE for admin CRUD page)
-- ============================================================================

-- Domains
CREATE POLICY "ECCD domains insertable by authenticated"
  ON procurements.sms_eccd_domains FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "ECCD domains updatable by authenticated"
  ON procurements.sms_eccd_domains FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "ECCD domains deletable by authenticated"
  ON procurements.sms_eccd_domains FOR DELETE
  USING (auth.role() = 'authenticated');

-- Competencies
CREATE POLICY "ECCD competencies insertable by authenticated"
  ON procurements.sms_eccd_competencies FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "ECCD competencies updatable by authenticated"
  ON procurements.sms_eccd_competencies FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "ECCD competencies deletable by authenticated"
  ON procurements.sms_eccd_competencies FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- 3. DROP OLD CONSTRAINTS FIRST (before data migration)
-- ============================================================================

-- Drop ALL check constraints on sms_eccd_assessments (inline constraints have
-- auto-generated names that vary per database, so we drop them dynamically).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'procurements'
      AND rel.relname = 'sms_eccd_assessments'
      AND con.contype = 'c'  -- check constraints only
  LOOP
    EXECUTE format('ALTER TABLE procurements.sms_eccd_assessments DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- ============================================================================
-- 4. DATA MIGRATION: Convert existing assessment data
-- ============================================================================

-- Delete MOSY records (no equivalent in new 2-semester model)
DELETE FROM procurements.sms_eccd_assessments WHERE period = 'MOSY';

-- Convert ratings: 2 or 3 -> 1 (checked), 1 -> 0 (unchecked), null stays null
UPDATE procurements.sms_eccd_assessments
SET rating = CASE
  WHEN rating >= 2 THEN 1
  WHEN rating = 1 THEN 0
  ELSE rating
END
WHERE rating IS NOT NULL;

-- Convert periods: BOSY -> 1ST_SEM, EOSY -> 2ND_SEM
UPDATE procurements.sms_eccd_assessments SET period = '1ST_SEM' WHERE period = 'BOSY';
UPDATE procurements.sms_eccd_assessments SET period = '2ND_SEM' WHERE period = 'EOSY';

-- ============================================================================
-- 5. ADD NEW CONSTRAINTS (after data is migrated)
-- ============================================================================

ALTER TABLE procurements.sms_eccd_assessments
  ADD CONSTRAINT sms_eccd_assessments_period_check
  CHECK (period IN ('1ST_SEM', '2ND_SEM'));

ALTER TABLE procurements.sms_eccd_assessments
  ADD CONSTRAINT sms_eccd_assessments_rating_check
  CHECK (rating IN (0, 1));

-- ============================================================================
-- 5. PRE-SEED SCALE SCORE DEFAULTS
-- Standard DepEd ECCD scale score mappings per domain.
-- Domain item counts: GM=8, FM=8, SH=7, RL=7, EL=7, COG=9, SE=8
-- ============================================================================

-- Gross Motor Skills (8 items)
INSERT INTO procurements.sms_eccd_scale_scores (domain_id, raw_score, scale_score) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 0, 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 1, 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 2, 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 3, 7),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 4, 9),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 5, 11),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 6, 13),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 7, 15),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 8, 17)
ON CONFLICT (domain_id, raw_score) DO NOTHING;

-- Fine Motor Skills (8 items)
INSERT INTO procurements.sms_eccd_scale_scores (domain_id, raw_score, scale_score) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 0, 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 1, 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 2, 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 3, 7),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 4, 9),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 5, 11),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 6, 13),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 7, 15),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 8, 17)
ON CONFLICT (domain_id, raw_score) DO NOTHING;

-- Self-Help / Adaptive (7 items)
INSERT INTO procurements.sms_eccd_scale_scores (domain_id, raw_score, scale_score) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 0, 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 1, 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 2, 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 3, 8),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 4, 10),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 5, 13),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 6, 15),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 7, 17)
ON CONFLICT (domain_id, raw_score) DO NOTHING;

-- Receptive Language (7 items)
INSERT INTO procurements.sms_eccd_scale_scores (domain_id, raw_score, scale_score) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 0, 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 1, 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 2, 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 3, 8),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 4, 10),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 5, 13),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 6, 15),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 7, 17)
ON CONFLICT (domain_id, raw_score) DO NOTHING;

-- Expressive Language (7 items)
INSERT INTO procurements.sms_eccd_scale_scores (domain_id, raw_score, scale_score) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 0, 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 1, 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 2, 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 3, 8),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 4, 10),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 5, 13),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 6, 15),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 7, 17)
ON CONFLICT (domain_id, raw_score) DO NOTHING;

-- Cognitive (9 items)
INSERT INTO procurements.sms_eccd_scale_scores (domain_id, raw_score, scale_score) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 0, 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 1, 2),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 2, 4),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 3, 6),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 4, 8),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 5, 10),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 6, 12),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 7, 14),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 8, 16),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 9, 17)
ON CONFLICT (domain_id, raw_score) DO NOTHING;

-- Socio-Emotional (8 items)
INSERT INTO procurements.sms_eccd_scale_scores (domain_id, raw_score, scale_score) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 0, 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 1, 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 2, 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 3, 7),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 4, 9),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 5, 11),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 6, 13),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 7, 15),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 8, 17)
ON CONFLICT (domain_id, raw_score) DO NOTHING;
