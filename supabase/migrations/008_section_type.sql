-- Add section_type column to sms_sections
-- section_type: 'heterogeneous' | 'homogeneous_fast_learner' | 'homogeneous_crack_section' | 'homogeneous_random'

-- Drop section_sub_type if it existed from a previous migration
ALTER TABLE procurements.sms_sections DROP COLUMN IF EXISTS section_sub_type;
ALTER TABLE procurements.sms_sections DROP CONSTRAINT IF EXISTS chk_section_sub_type_when_heterogeneous;

-- Add section_type if not exists
ALTER TABLE procurements.sms_sections ADD COLUMN IF NOT EXISTS section_type TEXT;

-- Normalize invalid section_type values (empty string or unknown values) to NULL
-- before adding the check constraint, so existing rows don't violate it
UPDATE procurements.sms_sections
SET section_type = NULL
WHERE section_type IS NOT NULL
  AND section_type NOT IN (
    'heterogeneous',
    'homogeneous_fast_learner',
    'homogeneous_crack_section',
    'homogeneous_random'
  );

-- Drop old check constraint (if migration 008 was run before) and add new one
ALTER TABLE procurements.sms_sections DROP CONSTRAINT IF EXISTS sms_sections_section_type_check;
ALTER TABLE procurements.sms_sections ADD CONSTRAINT sms_sections_section_type_check
CHECK (
  section_type IS NULL OR section_type IN (
    'heterogeneous',
    'homogeneous_fast_learner',
    'homogeneous_crack_section',
    'homogeneous_random'
  )
);

-- Add index for filtering by section type
CREATE INDEX IF NOT EXISTS idx_sections_section_type ON procurements.sms_sections(section_type);

COMMENT ON COLUMN procurements.sms_sections.section_type IS 'Section type: heterogeneous, homogeneous_fast_learner, homogeneous_crack_section, or homogeneous_random';
