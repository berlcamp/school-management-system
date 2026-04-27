-- ============================================================================
-- SCHOOL SLUG: pretty URL segment for /schools/[slug]
-- ============================================================================
-- Adds sms_schools.slug (auto-generated from name on insert when blank).
-- - Backfills existing rows; collisions disambiguated by appending the row id.
-- - lower(slug) UNIQUE INDEX so lookups are case-insensitive but stable.
-- - BEFORE INSERT/UPDATE trigger normalizes user-entered slugs and fills blanks.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- Helper: convert text to URL-safe slug (lowercase, hyphen-separated)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_slugify(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result TEXT;
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;
  v_result := lower(p_input);
  v_result := regexp_replace(v_result, '[^a-z0-9]+', '-', 'g');
  v_result := regexp_replace(v_result, '^-+|-+$', '', 'g');
  RETURN NULLIF(v_result, '');
END;
$$;

-- ----------------------------------------------------------------------------
-- Add column (nullable so backfill can run)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_schools
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- ----------------------------------------------------------------------------
-- Backfill: every existing row gets a slug; duplicates disambiguated by id.
-- ----------------------------------------------------------------------------
WITH computed AS (
  SELECT
    id,
    CASE
      WHEN COUNT(*) OVER (PARTITION BY procurements.sms_slugify(name)) > 1
        THEN procurements.sms_slugify(name) || '-' || id::TEXT
      ELSE procurements.sms_slugify(name)
    END AS new_slug
  FROM procurements.sms_schools
  WHERE slug IS NULL OR length(trim(slug)) = 0
)
UPDATE procurements.sms_schools s
SET slug = COALESCE(c.new_slug, 'school-' || s.id::TEXT)
FROM computed c
WHERE s.id = c.id;

-- Lock down: slug is required from here on.
ALTER TABLE procurements.sms_schools
  ALTER COLUMN slug SET NOT NULL;

-- Case-insensitive uniqueness so /schools/foo and /schools/FOO can't collide.
CREATE UNIQUE INDEX IF NOT EXISTS sms_schools_slug_lower_unique
  ON procurements.sms_schools (lower(slug));

-- Lookup index for the public landing page query.
CREATE INDEX IF NOT EXISTS idx_sms_schools_slug
  ON procurements.sms_schools (slug);

COMMENT ON COLUMN procurements.sms_schools.slug IS
  'URL-safe identifier for the public school page (/schools/[slug]); auto-generated from name when blank.';

-- ----------------------------------------------------------------------------
-- Trigger: normalize / auto-fill slug, with collision suffixing
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_schools_set_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_n INT := 1;
BEGIN
  IF NEW.slug IS NULL OR length(trim(NEW.slug)) = 0 THEN
    v_base := procurements.sms_slugify(NEW.name);
    IF v_base IS NULL OR v_base = '' THEN
      v_base := 'school';
    END IF;
  ELSE
    v_base := procurements.sms_slugify(NEW.slug);
    IF v_base IS NULL OR v_base = '' THEN
      v_base := procurements.sms_slugify(NEW.name);
    END IF;
    IF v_base IS NULL OR v_base = '' THEN
      v_base := 'school';
    END IF;
  END IF;

  v_candidate := v_base;

  WHILE EXISTS (
    SELECT 1 FROM procurements.sms_schools
    WHERE lower(slug) = lower(v_candidate)
      AND id IS DISTINCT FROM NEW.id
  ) LOOP
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n::TEXT;
  END LOOP;

  NEW.slug := v_candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_schools_set_slug_trg ON procurements.sms_schools;
CREATE TRIGGER sms_schools_set_slug_trg
  BEFORE INSERT OR UPDATE OF slug ON procurements.sms_schools
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_schools_set_slug();
