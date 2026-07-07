-- ============================================================================
-- CRLA MATERIALS — MULTIPLE PHASES
--
-- A CRLA material may now apply to several administration phases at once
-- (BoSY / MoSY / EoSY) instead of a single one. The single `phase` column is
-- replaced by a `phases TEXT[]` array. An empty array means "any phase".
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_crla_materials
  ADD COLUMN IF NOT EXISTS phases TEXT[] NOT NULL DEFAULT '{}';

-- Migrate the existing single phase into the array.
UPDATE procurements.sms_crla_materials
  SET phases = ARRAY[phase]
  WHERE phase IS NOT NULL
    AND (phases IS NULL OR phases = '{}');

-- Every element must be a valid phase.
ALTER TABLE procurements.sms_crla_materials
  DROP CONSTRAINT IF EXISTS sms_crla_materials_phases_valid;
ALTER TABLE procurements.sms_crla_materials
  ADD CONSTRAINT sms_crla_materials_phases_valid
  CHECK (phases <@ ARRAY['BoSY', 'MoSY', 'EoSY']::TEXT[]);

-- Drop the old single-phase column.
ALTER TABLE procurements.sms_crla_materials DROP COLUMN IF EXISTS phase;

COMMENT ON COLUMN procurements.sms_crla_materials.phases IS
  'Administration phases this material applies to (BoSY/MoSY/EoSY). Empty = any phase.';
