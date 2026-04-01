-- Add principal name and title to school settings
ALTER TABLE procurements.sms_school_settings
  ADD COLUMN IF NOT EXISTS principal_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS principal_title TEXT DEFAULT 'Principal';
