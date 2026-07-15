-- ============================================================================
-- School-authored assessment materials (CRLA / Phil-IRI / RMA)
--
-- Until now every assessment material was authored by the division office and
-- shared with all schools. School heads now need to author materials for their
-- OWN school, usable only by that school's teachers.
--
-- Authoring follows the TOS / Exam sharing model (migrations 096, 099):
--   * school_id IS NULL -> DIVISION-authored, usable by ALL schools.
--   * school_id set      -> SCHOOL-authored, usable only by that school.
--
-- Existing rows keep school_id NULL, so every current material stays division-
-- wide. Scoping is enforced in the app layer (matching sms_tos / sms_exams).
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- CRLA materials
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_crla_materials
  ADD COLUMN IF NOT EXISTS school_id BIGINT
  REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN procurements.sms_crla_materials.school_id IS
  'NULL = division-authored (usable by all schools); set = school-authored (that school only).';

CREATE INDEX IF NOT EXISTS idx_sms_crla_materials_school
  ON procurements.sms_crla_materials(school_id);

-- ----------------------------------------------------------------------------
-- CRLA record forms (Part 2: reading fluency & comprehension)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_crla_record_forms
  ADD COLUMN IF NOT EXISTS school_id BIGINT
  REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN procurements.sms_crla_record_forms.school_id IS
  'NULL = division-authored (usable by all schools); set = school-authored (that school only).';

CREATE INDEX IF NOT EXISTS idx_sms_crla_record_forms_school
  ON procurements.sms_crla_record_forms(school_id);

-- ----------------------------------------------------------------------------
-- Phil-IRI materials
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_philiri_materials
  ADD COLUMN IF NOT EXISTS school_id BIGINT
  REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN procurements.sms_philiri_materials.school_id IS
  'NULL = division-authored (usable by all schools); set = school-authored (that school only).';

CREATE INDEX IF NOT EXISTS idx_sms_philiri_materials_school
  ON procurements.sms_philiri_materials(school_id);

-- ----------------------------------------------------------------------------
-- RMA materials
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_rma_materials
  ADD COLUMN IF NOT EXISTS school_id BIGINT
  REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN procurements.sms_rma_materials.school_id IS
  'NULL = division-authored (usable by all schools); set = school-authored (that school only).';

CREATE INDEX IF NOT EXISTS idx_sms_rma_materials_school
  ON procurements.sms_rma_materials(school_id);
