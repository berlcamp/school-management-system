-- Fix sections unique constraint to include school_id
-- The original constraint UNIQUE(name, school_year, grade_level) doesn't account
-- for different schools having sections with the same name/grade/year

ALTER TABLE procurements.sms_sections
  DROP CONSTRAINT IF EXISTS sms_sections_name_school_year_grade_level_key;

ALTER TABLE procurements.sms_sections
  ADD CONSTRAINT sms_sections_name_school_year_grade_level_school_id_key
  UNIQUE (name, school_year, grade_level, school_id);
