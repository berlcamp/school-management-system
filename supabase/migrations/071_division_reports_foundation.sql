-- ============================================================================
-- DIVISION REPORTS FOUNDATION
-- ============================================================================
-- Phase 1 of the SDO Reports module:
--   * sms_schools: principal contact + extra socials + address breakdown
--   * sms_rooms: condition enum
--   * sms_users: staff_category_code (for non-teaching breakdown)
--   * sms_staff_categories (seeded)
--   * sms_class_size_standards (seeded with DepEd defaults)
--   * Direct-derive RPCs for School List, Teaching Personnel, Non-Teaching,
--     Rooms, and Classroom Needs Analysis.
-- Additive only. No destructive changes.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- 1. sms_schools extensions
-- ============================================================================
ALTER TABLE procurements.sms_schools
  ADD COLUMN IF NOT EXISTS principal_name TEXT,
  ADD COLUMN IF NOT EXISTS principal_email TEXT,
  ADD COLUMN IF NOT EXISTS principal_phone TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS barangay TEXT,
  ADD COLUMN IF NOT EXISTS street TEXT;

-- ============================================================================
-- 2. sms_rooms.condition
-- ============================================================================
ALTER TABLE procurements.sms_rooms
  ADD COLUMN IF NOT EXISTS condition TEXT;

ALTER TABLE procurements.sms_rooms
  DROP CONSTRAINT IF EXISTS sms_rooms_condition_check;
ALTER TABLE procurements.sms_rooms
  ADD CONSTRAINT sms_rooms_condition_check
  CHECK (
    condition IS NULL
    OR condition IN ('good', 'needs_minor_repair', 'needs_major_repair', 'condemned')
  );

-- ============================================================================
-- 3. sms_staff_categories (reference for non-teaching breakdown)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_staff_categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  is_teaching BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE procurements.sms_staff_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff categories readable by authenticated"
  ON procurements.sms_staff_categories;
CREATE POLICY "Staff categories readable by authenticated"
  ON procurements.sms_staff_categories FOR SELECT
  USING (auth.role() = 'authenticated');

GRANT SELECT ON procurements.sms_staff_categories TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_staff_categories_id_seq TO authenticated;

-- Seed DepEd non-teaching categories
INSERT INTO procurements.sms_staff_categories (code, label, is_teaching, sort_order)
VALUES
  ('admin',    'Administrative',    false, 10),
  ('utility',  'Utility',           false, 20),
  ('security', 'Security',          false, 30),
  ('health',   'Health Services',   false, 40),
  ('library',  'Library',           false, 50),
  ('guidance', 'Guidance',          false, 60),
  ('other',    'Other Non-Teaching',false, 99),
  ('teacher',  'Teaching',          true,  0)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 4. sms_users.staff_category_code
-- ============================================================================
ALTER TABLE procurements.sms_users
  ADD COLUMN IF NOT EXISTS staff_category_code TEXT;

-- Validate against sms_staff_categories
ALTER TABLE procurements.sms_users
  DROP CONSTRAINT IF EXISTS sms_users_staff_category_code_fkey;
-- Not a FK (to avoid lock contention on sms_users); enforce via check list.
ALTER TABLE procurements.sms_users
  DROP CONSTRAINT IF EXISTS sms_users_staff_category_code_check;
ALTER TABLE procurements.sms_users
  ADD CONSTRAINT sms_users_staff_category_code_check
  CHECK (
    staff_category_code IS NULL
    OR staff_category_code IN (
      'admin','utility','security','health','library','guidance','other','teacher'
    )
  );

-- ============================================================================
-- 5. sms_class_size_standards (per-grade DepEd guideline)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_class_size_standards (
  grade_level INT PRIMARY KEY,
  max_students INT NOT NULL CHECK (max_students > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE procurements.sms_class_size_standards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Class size standards readable by authenticated"
  ON procurements.sms_class_size_standards;
CREATE POLICY "Class size standards readable by authenticated"
  ON procurements.sms_class_size_standards FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Class size standards writable by division admin"
  ON procurements.sms_class_size_standards;
CREATE POLICY "Class size standards writable by division admin"
  ON procurements.sms_class_size_standards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin','division_type')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin','division_type')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_class_size_standards TO authenticated;

-- Seed typical DepEd class-size guidelines
-- (can be overridden by division admin in Settings → Class Size Standards)
INSERT INTO procurements.sms_class_size_standards (grade_level, max_students) VALUES
  (-1, 15),   -- SNED non-graded
  (0, 30),    -- Kindergarten
  (1, 40), (2, 40), (3, 40),
  (4, 45), (5, 45), (6, 45),
  (7, 50), (8, 50), (9, 50), (10, 50),
  (11, 50), (12, 50)
ON CONFLICT (grade_level) DO NOTHING;

-- ============================================================================
-- 6. Operational indexes (idempotent)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_sms_enrollments_school_year_grade
  ON procurements.sms_enrollments (school_year, grade_level);

CREATE INDEX IF NOT EXISTS idx_sms_users_school_type_active
  ON procurements.sms_users (school_id, type, is_active);

CREATE INDEX IF NOT EXISTS idx_sms_rooms_school_type
  ON procurements.sms_rooms (school_id, room_type);

-- ============================================================================
-- 7. RPC: division_school_list
--    Returns one row per active school in the division plus derived counts.
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_school_list()
RETURNS TABLE (
  id BIGINT,
  school_id TEXT,
  name TEXT,
  school_type TEXT,
  district TEXT,
  municipality_city TEXT,
  region TEXT,
  barangay TEXT,
  street TEXT,
  address TEXT,
  email TEXT,
  telephone_number TEXT,
  mobile_number TEXT,
  facebook_url TEXT,
  twitter_url TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  principal_name TEXT,
  principal_email TEXT,
  principal_phone TEXT,
  user_count BIGINT,
  teacher_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT
    s.id,
    s.school_id,
    s.name,
    s.school_type,
    s.district,
    s.municipality_city,
    s.region,
    s.barangay,
    s.street,
    s.address,
    s.email,
    s.telephone_number,
    s.mobile_number,
    s.facebook_url,
    s.twitter_url,
    s.instagram_url,
    s.tiktok_url,
    s.principal_name,
    s.principal_email,
    s.principal_phone,
    COALESCE(u.user_count, 0)    AS user_count,
    COALESCE(u.teacher_count, 0) AS teacher_count
  FROM procurements.sms_schools s
  LEFT JOIN (
    SELECT
      school_id,
      COUNT(*) FILTER (WHERE is_active) AS user_count,
      COUNT(*) FILTER (WHERE is_active AND type = 'teacher') AS teacher_count
    FROM procurements.sms_users
    WHERE school_id IS NOT NULL
    GROUP BY school_id
  ) u ON u.school_id = s.id
  WHERE s.is_active
  ORDER BY s.name;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_school_list() TO authenticated;

-- ============================================================================
-- 8. RPC: division_teaching_personnel_summary
--    One row per (school, role) for teaching staff (type='teacher').
--    Optional p_school_type filter narrows to schools of that type.
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_teaching_personnel_summary(
  p_school_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  total BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT
    s.id AS school_id,
    s.name AS school_name,
    COUNT(u.id) AS total
  FROM procurements.sms_schools s
  LEFT JOIN procurements.sms_users u
    ON u.school_id = s.id
    AND u.is_active
    AND u.type = 'teacher'
  WHERE s.is_active
    AND (p_school_type IS NULL OR s.school_type = p_school_type)
  GROUP BY s.id, s.name
  ORDER BY s.name;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_teaching_personnel_summary(TEXT) TO authenticated;

-- ============================================================================
-- 9. RPC: division_non_teaching_summary
--    Breakdown by staff_category for non-teaching staff.
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_non_teaching_summary()
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
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
  GROUP BY s.id, s.name, c.code, c.label
  ORDER BY s.name, staff_category_label;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_non_teaching_summary() TO authenticated;

-- ============================================================================
-- 10. RPC: division_rooms_summary
--     Per-school room inventory grouped by (room_type, condition).
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_rooms_summary()
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
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
    COALESCE(r.room_type, 'other') AS room_type,
    COALESCE(r.condition, 'unspecified') AS condition,
    COUNT(r.id) AS total
  FROM procurements.sms_schools s
  LEFT JOIN procurements.sms_rooms r
    ON r.school_id = s.id
    AND r.is_active
  WHERE s.is_active
  GROUP BY s.id, s.name, r.room_type, r.condition
  ORDER BY s.name, room_type, condition;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_rooms_summary() TO authenticated;

-- ============================================================================
-- 11. RPC: division_classroom_needs
--     Classroom shortage/surplus analysis per (school, grade_level)
--     based on live enrollments + classrooms + class size standards.
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_classroom_needs(
  p_school_year TEXT
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
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

COMMENT ON TABLE procurements.sms_staff_categories IS
  'Lookup of staff categories (admin/utility/security/etc.) for non-teaching breakdown';
COMMENT ON TABLE procurements.sms_class_size_standards IS
  'DepEd standard class size per grade level; drives Classroom Needs Analysis';
