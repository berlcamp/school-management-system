-- Add semester support for Grade 11 and Grade 12 enrollments
-- Grades 0-10: semester is NULL (one enrollment per year)
-- Grades 11-12: semester is 1 or 2 (two enrollments per year)

-- 1. Add semester column (nullable)
ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS semester INTEGER;

-- 2. Backfill: existing Grade 11/12 rows get semester 1; Grades 0-10 get NULL
UPDATE procurements.sms_enrollments
SET semester = CASE
  WHEN grade_level BETWEEN 11 AND 12 THEN 1
  ELSE NULL
END
WHERE semester IS NULL;

-- 3. Add CHECK constraint: grade 11-12 must have semester 1 or 2; others must have NULL
ALTER TABLE procurements.sms_enrollments
  DROP CONSTRAINT IF EXISTS chk_enrollments_semester;
ALTER TABLE procurements.sms_enrollments
  ADD CONSTRAINT chk_enrollments_semester CHECK (
    (grade_level BETWEEN 11 AND 12 AND semester IN (1, 2))
    OR (grade_level NOT BETWEEN 11 AND 12 AND semester IS NULL)
  );

-- 4. Drop old unique constraint
ALTER TABLE procurements.sms_enrollments
  DROP CONSTRAINT IF EXISTS uq_enrollments_student_school_year;

-- 5. Add new unique constraint: (student_id, school_year, COALESCE(semester, 0))
-- Uses unique index since COALESCE is an expression
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_student_school_year_semester
  ON procurements.sms_enrollments (student_id, school_year, COALESCE(semester, 0));

-- 6. Index for filtering by semester
CREATE INDEX IF NOT EXISTS idx_enrollments_semester
  ON procurements.sms_enrollments(semester);

COMMENT ON COLUMN procurements.sms_enrollments.semester IS 'Semester (1 or 2) for Grade 11-12; NULL for Grades 0-10';
