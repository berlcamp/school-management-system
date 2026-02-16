-- Prevent multiple enrollments of the same student in the same school year
-- Keeps only the most recent enrollment per (student_id, school_year) before applying constraint

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Delete duplicate enrollments, keeping the one with the highest id (most recent)
  FOR r IN (
    SELECT student_id, school_year, MAX(id) as keep_id
    FROM procurements.sms_enrollments
    GROUP BY student_id, school_year
    HAVING COUNT(*) > 1
  ) LOOP
    DELETE FROM procurements.sms_enrollments
    WHERE student_id = r.student_id
      AND school_year = r.school_year
      AND id != r.keep_id;
  END LOOP;
END $$;

ALTER TABLE procurements.sms_enrollments
  ADD CONSTRAINT uq_enrollments_student_school_year UNIQUE (student_id, school_year);
