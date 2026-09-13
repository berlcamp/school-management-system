-- ============================================================================
-- ECCD SCALE SCORES — AGE BAND
-- ============================================================================
-- 059 keyed the raw -> scaled mapping on (domain_id, raw_score) alone. DepEd's
-- conversion table is age-referenced and publishes a separate column per age
-- band, so the same raw score converts differently depending on the child:
-- Gross Motor raw 13 is scaled 13 at 4.1-5.0 years and 11 at 5.1-5.11. A table
-- with no band column cannot hold both, so whichever figure was entered has
-- been applied to every learner regardless of age.
--
-- Adds the missing dimension. `age_band` is free TEXT validated in
-- `lib/constants/eccd.ts` per the 119/132 precedent, so a DepEd revision that
-- re-cuts the bands is a constants change rather than a migration that
-- invalidates mappings a division has already entered.
--
-- NOTHING MOVES ON APPLY, and the nullable default is what does it (the
-- 153/160/179 rule): every existing row keeps `age_band IS NULL`, which the
-- lookup reads as "applies at any age" — exactly today's behaviour. A banded row
-- is entered one band at a time at /settings/eccd and takes precedence only for
-- a learner whose age falls in it; clearing the banded rows reverts that domain
-- exactly, without a migration. Nothing is seeded here: the published tables
-- live in the constants file and are loaded into the grid for review by an
-- explicit button, never written behind the division's back.
--
-- One column and two indexes. No table, policy, trigger or function replaced,
-- and no DML.
--
-- Rows affected: none. To confirm before applying:
--   SELECT count(*) FROM procurements.sms_eccd_scale_scores;          -- unchanged by this
--   SELECT count(*) FROM procurements.sms_eccd_scale_scores
--    WHERE age_band IS NOT NULL;                                      -- 0 after applying
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. The column
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_eccd_scale_scores
  ADD COLUMN IF NOT EXISTS age_band TEXT;

COMMENT ON COLUMN procurements.sms_eccd_scale_scores.age_band IS
  'DepEd conversion-table age band (e.g. "5.1-5.11"). NULL = applies at any age, '
  'which is every row predating migration 186. Validated in lib/constants/eccd.ts, '
  'not by a CHECK, so a revised band list does not invalidate stored mappings.';

-- ----------------------------------------------------------------------------
-- 2. Re-key the uniqueness
-- ----------------------------------------------------------------------------
-- 059 declared UNIQUE(domain_id, raw_score) inline, so the constraint carries an
-- auto-generated name that can differ per database. Rediscovered from
-- pg_constraint rather than dropped by name, per the 116 lesson.
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
      AND rel.relname = 'sms_eccd_scale_scores'
      AND con.contype = 'u'
      AND (
        -- ::TEXT because attname is `name`, and name[] = text[] has no operator
        SELECT array_agg(att.attname::TEXT ORDER BY att.attname::TEXT)
        FROM unnest(con.conkey) AS k(attnum)
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      ) = ARRAY['domain_id', 'raw_score']
  LOOP
    EXECUTE format(
      'ALTER TABLE procurements.sms_eccd_scale_scores DROP CONSTRAINT %I', r.conname
    );
    RAISE NOTICE 'dropped unique constraint %', r.conname;
  END LOOP;
END $$;

-- Two PARTIAL indexes rather than one UNIQUE: Postgres treats NULLs as distinct,
-- so a plain UNIQUE(domain_id, age_band, raw_score) would let the unbanded rows
-- duplicate freely (the 121/163/179 precedent).
CREATE UNIQUE INDEX IF NOT EXISTS uq_eccd_scale_scores_any_age
  ON procurements.sms_eccd_scale_scores (domain_id, raw_score)
  WHERE age_band IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eccd_scale_scores_banded
  ON procurements.sms_eccd_scale_scores (domain_id, age_band, raw_score)
  WHERE age_band IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eccd_scale_scores_domain_band
  ON procurements.sms_eccd_scale_scores (domain_id, age_band);
