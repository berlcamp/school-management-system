-- ============================================================================
-- Add student_to_principal evaluation type + explicit school head target
-- ============================================================================
-- "Teacher to School Head" (teacher_to_principal) and the new
-- "Student to School Head" (student_to_principal) evaluations now target a
-- specific school head / assistant school head, stored on the evaluation via
-- evaluatee_id (references procurements.sms_users.id).

SET search_path TO procurements, public;

-- Allow the new student_to_principal type
ALTER TABLE procurements.sms_evaluations
  DROP CONSTRAINT IF EXISTS sms_evaluations_type_check;

ALTER TABLE procurements.sms_evaluations
  ADD CONSTRAINT sms_evaluations_type_check
  CHECK (type IN (
    'student_to_teacher',
    'teacher_to_principal',
    'principal_to_teacher',
    'student_to_principal'
  ));

-- Specific school head being evaluated (for *_to_principal types)
ALTER TABLE procurements.sms_evaluations
  ADD COLUMN IF NOT EXISTS evaluatee_id BIGINT;

COMMENT ON COLUMN procurements.sms_evaluations.evaluatee_id IS
  'For teacher_to_principal / student_to_principal: the specific school head or assistant school head being evaluated (sms_users.id)';

-- respondent_type already permits student/teacher/principal (migration 060),
-- which covers student_to_principal (respondent = student).

COMMENT ON TABLE procurements.sms_evaluations IS
  'Evaluation questionnaires — student-to-teacher, teacher-to-principal, principal-to-teacher, or student-to-principal';
