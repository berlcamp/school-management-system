-- Add promotion_deadline column to school settings
ALTER TABLE procurements.sms_school_settings
ADD COLUMN IF NOT EXISTS promotion_deadline DATE;
