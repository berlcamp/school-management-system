-- Add optional remarks field to evaluation responses
ALTER TABLE procurements.sms_evaluation_responses
  ADD COLUMN IF NOT EXISTS remarks TEXT;
