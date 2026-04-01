ALTER TABLE procurements.sms_school_settings
  ADD COLUMN IF NOT EXISTS allow_edit_promoted_student_grades BOOLEAN NOT NULL DEFAULT true;
