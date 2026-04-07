-- ============================================================================
-- Add principal_to_teacher evaluation type
-- ============================================================================

SET search_path TO procurements, public;

-- Drop and recreate the CHECK constraint on sms_evaluations.type
ALTER TABLE procurements.sms_evaluations
  DROP CONSTRAINT IF EXISTS sms_evaluations_type_check;

ALTER TABLE procurements.sms_evaluations
  ADD CONSTRAINT sms_evaluations_type_check
  CHECK (type IN ('student_to_teacher', 'teacher_to_principal', 'principal_to_teacher'));

-- Drop and recreate the CHECK constraint on sms_evaluation_responses.respondent_type
ALTER TABLE procurements.sms_evaluation_responses
  DROP CONSTRAINT IF EXISTS sms_evaluation_responses_respondent_type_check;

ALTER TABLE procurements.sms_evaluation_responses
  ADD CONSTRAINT sms_evaluation_responses_respondent_type_check
  CHECK (respondent_type IN ('student', 'teacher', 'principal'));

COMMENT ON TABLE procurements.sms_evaluations IS 'Evaluation questionnaires — student-to-teacher, teacher-to-principal, or principal-to-teacher';
