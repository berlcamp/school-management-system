-- ============================================================================
-- DIVISION REPORTS: expose school_type on all report RPCs
-- ============================================================================
-- Polish migration. Adds `school_type TEXT` to the result of every division
-- report RPC that didn't already expose it, so the UI can filter by school
-- type (Elementary / Junior High / Senior High / etc.) client-side without
-- round-tripping.
-- ============================================================================

SET search_path TO procurements, public;

-- ---------------------------------------------------------------------------
-- division_enrollment_summary — already takes p_school_type; now also returns it
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS procurements.division_enrollment_summary(
  TEXT, SMALLINT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION procurements.division_enrollment_summary(
  p_school_year TEXT,
  p_semester SMALLINT DEFAULT NULL,
  p_category TEXT DEFAULT 'enrollment',
  p_modality TEXT DEFAULT 'all',
  p_school_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  school_type TEXT,
  grade_level INT,
  male INT,
  female INT,
  total INT,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH latest AS (
    SELECT
      s.id AS school_id,
      s.name AS school_name,
      s.school_type,
      sub.id AS submission_id,
      sub.status
    FROM procurements.sms_schools s
    LEFT JOIN procurements.sms_division_report_submissions sub
      ON sub.school_id = s.id
      AND sub.school_year = p_school_year
      AND sub.report_type = 'enrollment'
      AND (
        (p_semester IS NULL AND sub.semester IS NULL)
        OR sub.semester = p_semester
      )
    WHERE s.is_active
      AND (p_school_type IS NULL OR s.school_type = p_school_type)
  )
  SELECT
    latest.school_id,
    latest.school_name,
    latest.school_type,
    COALESCE(r.grade_level, -99) AS grade_level,
    COALESCE(SUM(r.male)::int, 0) AS male,
    COALESCE(SUM(r.female)::int, 0) AS female,
    COALESCE(SUM(r.male + r.female)::int, 0) AS total,
    COALESCE(latest.status, 'missing') AS status
  FROM latest
  LEFT JOIN procurements.sms_report_enrollment_rows r
    ON r.submission_id = latest.submission_id
    AND r.category = p_category
    AND r.modality = p_modality
  GROUP BY latest.school_id, latest.school_name, latest.school_type,
           r.grade_level, latest.status
  ORDER BY latest.school_name, grade_level;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_enrollment_summary(TEXT, SMALLINT, TEXT, TEXT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- division_track_strand_summary
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS procurements.division_track_strand_summary(
  TEXT, SMALLINT, INT
);

CREATE OR REPLACE FUNCTION procurements.division_track_strand_summary(
  p_school_year TEXT,
  p_semester SMALLINT,
  p_grade_level INT DEFAULT NULL
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  school_type TEXT,
  track TEXT,
  strand TEXT,
  grade_level INT,
  male INT,
  female INT,
  total INT,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH latest AS (
    SELECT
      s.id AS school_id,
      s.name AS school_name,
      s.school_type,
      sub.id AS submission_id,
      sub.status
    FROM procurements.sms_schools s
    LEFT JOIN procurements.sms_division_report_submissions sub
      ON sub.school_id = s.id
      AND sub.school_year = p_school_year
      AND sub.semester = p_semester
      AND sub.report_type = 'track_strand'
    WHERE s.is_active
  )
  SELECT
    latest.school_id,
    latest.school_name,
    latest.school_type,
    COALESCE(r.track, '') AS track,
    COALESCE(r.strand, '') AS strand,
    COALESCE(r.grade_level, 0) AS grade_level,
    COALESCE(r.male, 0) AS male,
    COALESCE(r.female, 0) AS female,
    COALESCE(r.male, 0) + COALESCE(r.female, 0) AS total,
    COALESCE(latest.status, 'missing') AS status
  FROM latest
  LEFT JOIN procurements.sms_report_track_strand_rows r
    ON r.submission_id = latest.submission_id
    AND (p_grade_level IS NULL OR r.grade_level = p_grade_level)
  ORDER BY latest.school_name, track, strand, grade_level;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_track_strand_summary(TEXT, SMALLINT, INT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- division_shs_specialization_summary
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS procurements.division_shs_specialization_summary(
  TEXT, SMALLINT, INT, TEXT
);

CREATE OR REPLACE FUNCTION procurements.division_shs_specialization_summary(
  p_school_year TEXT,
  p_semester SMALLINT,
  p_grade_level INT DEFAULT NULL,
  p_strand TEXT DEFAULT NULL
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  school_type TEXT,
  strand TEXT,
  specialization TEXT,
  grade_level INT,
  male INT,
  female INT,
  total INT,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH latest AS (
    SELECT
      s.id AS school_id,
      s.name AS school_name,
      s.school_type,
      sub.id AS submission_id,
      sub.status
    FROM procurements.sms_schools s
    LEFT JOIN procurements.sms_division_report_submissions sub
      ON sub.school_id = s.id
      AND sub.school_year = p_school_year
      AND sub.semester = p_semester
      AND sub.report_type = 'shs_specialization'
    WHERE s.is_active
  )
  SELECT
    latest.school_id,
    latest.school_name,
    latest.school_type,
    COALESCE(r.strand, '') AS strand,
    COALESCE(r.specialization, '') AS specialization,
    COALESCE(r.grade_level, 0) AS grade_level,
    COALESCE(r.male, 0) AS male,
    COALESCE(r.female, 0) AS female,
    COALESCE(r.male, 0) + COALESCE(r.female, 0) AS total,
    COALESCE(latest.status, 'missing') AS status
  FROM latest
  LEFT JOIN procurements.sms_report_shs_specialization_rows r
    ON r.submission_id = latest.submission_id
    AND (p_grade_level IS NULL OR r.grade_level = p_grade_level)
    AND (p_strand IS NULL OR r.strand = p_strand)
  ORDER BY latest.school_name, strand, specialization, grade_level;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_shs_specialization_summary(TEXT, SMALLINT, INT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- division_teaching_specialization_summary
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS procurements.division_teaching_specialization_summary(TEXT);

CREATE OR REPLACE FUNCTION procurements.division_teaching_specialization_summary(
  p_school_year TEXT
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  school_type TEXT,
  learning_area TEXT,
  male INT,
  female INT,
  total INT,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH latest AS (
    SELECT
      s.id AS school_id,
      s.name AS school_name,
      s.school_type,
      sub.id AS submission_id,
      sub.status
    FROM procurements.sms_schools s
    LEFT JOIN procurements.sms_division_report_submissions sub
      ON sub.school_id = s.id
      AND sub.school_year = p_school_year
      AND sub.semester IS NULL
      AND sub.report_type = 'teaching_specialization'
    WHERE s.is_active
  )
  SELECT
    latest.school_id,
    latest.school_name,
    latest.school_type,
    COALESCE(r.learning_area, '') AS learning_area,
    COALESCE(r.male, 0) AS male,
    COALESCE(r.female, 0) AS female,
    COALESCE(r.male, 0) + COALESCE(r.female, 0) AS total,
    COALESCE(latest.status, 'missing') AS status
  FROM latest
  LEFT JOIN procurements.sms_report_teaching_specialization_rows r
    ON r.submission_id = latest.submission_id
  ORDER BY latest.school_name, learning_area;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_teaching_specialization_summary(TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- division_non_teaching_summary
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS procurements.division_non_teaching_summary();

CREATE OR REPLACE FUNCTION procurements.division_non_teaching_summary()
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  school_type TEXT,
  staff_category_code TEXT,
  staff_category_label TEXT,
  total BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT
    s.id AS school_id,
    s.name AS school_name,
    s.school_type,
    COALESCE(c.code, 'other') AS staff_category_code,
    COALESCE(c.label, 'Other Non-Teaching') AS staff_category_label,
    COUNT(u.id) AS total
  FROM procurements.sms_schools s
  LEFT JOIN procurements.sms_users u
    ON u.school_id = s.id
    AND u.is_active
    AND u.type <> 'teacher'
    AND u.type NOT IN ('division_admin','division_type','super admin')
  LEFT JOIN procurements.sms_staff_categories c
    ON c.code = COALESCE(u.staff_category_code, 'other')
  WHERE s.is_active
  GROUP BY s.id, s.name, s.school_type, c.code, c.label
  ORDER BY s.name, staff_category_label;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_non_teaching_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- division_rooms_summary
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS procurements.division_rooms_summary();

CREATE OR REPLACE FUNCTION procurements.division_rooms_summary()
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  school_type TEXT,
  room_type TEXT,
  condition TEXT,
  total BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT
    s.id AS school_id,
    s.name AS school_name,
    s.school_type,
    COALESCE(r.room_type, 'other') AS room_type,
    COALESCE(r.condition, 'unspecified') AS condition,
    COUNT(r.id) AS total
  FROM procurements.sms_schools s
  LEFT JOIN procurements.sms_rooms r
    ON r.school_id = s.id
    AND r.is_active
  WHERE s.is_active
  GROUP BY s.id, s.name, s.school_type, r.room_type, r.condition
  ORDER BY s.name, room_type, condition;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_rooms_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- division_classroom_needs
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS procurements.division_classroom_needs(TEXT);

CREATE OR REPLACE FUNCTION procurements.division_classroom_needs(
  p_school_year TEXT
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  school_type TEXT,
  grade_level INT,
  enrolled BIGINT,
  standard_class_size INT,
  classrooms_needed INT,
  classrooms_available BIGINT,
  delta INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH enroll AS (
    SELECT
      st.school_id,
      e.grade_level,
      COUNT(*) AS enrolled
    FROM procurements.sms_enrollments e
    JOIN procurements.sms_students st ON st.id = e.student_id
    WHERE e.school_year = p_school_year
      AND e.status IN ('active','promoted','retained','graduated','completed')
    GROUP BY st.school_id, e.grade_level
  ),
  classrooms AS (
    SELECT
      r.school_id,
      COUNT(*) AS classrooms_available
    FROM procurements.sms_rooms r
    WHERE r.is_active AND r.room_type = 'classroom'
    GROUP BY r.school_id
  )
  SELECT
    s.id AS school_id,
    s.name AS school_name,
    s.school_type,
    COALESCE(e.grade_level, 0) AS grade_level,
    COALESCE(e.enrolled, 0) AS enrolled,
    COALESCE(st.max_students, 40) AS standard_class_size,
    CEIL(COALESCE(e.enrolled, 0)::numeric / GREATEST(COALESCE(st.max_students, 40), 1))::int
      AS classrooms_needed,
    COALESCE(c.classrooms_available, 0) AS classrooms_available,
    (COALESCE(c.classrooms_available, 0)::int
      - CEIL(COALESCE(e.enrolled, 0)::numeric / GREATEST(COALESCE(st.max_students, 40), 1))::int
    ) AS delta
  FROM procurements.sms_schools s
  LEFT JOIN enroll e ON e.school_id = s.id
  LEFT JOIN classrooms c ON c.school_id = s.id
  LEFT JOIN procurements.sms_class_size_standards st
    ON st.grade_level = e.grade_level
  WHERE s.is_active
  ORDER BY s.name, grade_level;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_classroom_needs(TEXT) TO authenticated;
