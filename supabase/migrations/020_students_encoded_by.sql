-- Add encoded_by column to sms_students
-- Tracks which user (teacher or staff) added the student record
ALTER TABLE procurements.sms_students
  ADD COLUMN IF NOT EXISTS encoded_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sms_students_encoded_by ON procurements.sms_students(encoded_by);

COMMENT ON COLUMN procurements.sms_students.encoded_by IS 'User (sms_users.id) who added this student record - teachers can only edit/delete students they encoded';
