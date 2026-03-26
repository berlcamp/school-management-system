-- ============================================================================
-- SUBJECTS MODULE: SECURITY & PERFORMANCE FIXES
-- ============================================================================
-- 1. RLS policies: restrict write access to authorized roles only
-- 2. RLS policies: enforce school_id isolation
-- 3. Unique constraint: per-school subject code uniqueness
-- 4. Composite index for schedule queries
-- 5. Optimized single-pass conflict detection function
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- HELPER: Get current user's SMS role and school_id from sms_users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_sms_user_info()
RETURNS TABLE(user_type TEXT, user_school_id TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT u.type, u.school_id
  FROM procurements.sms_users u
  WHERE u.user_id = auth.uid()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 1. FIX RLS POLICIES FOR sms_subjects
-- ============================================================================

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Subjects are viewable by authenticated users" ON procurements.sms_subjects;
DROP POLICY IF EXISTS "Subjects are insertable by admins" ON procurements.sms_subjects;
DROP POLICY IF EXISTS "Subjects are updatable by admins" ON procurements.sms_subjects;
DROP POLICY IF EXISTS "Subjects are deletable by admins" ON procurements.sms_subjects;

-- SELECT: authenticated users can only see subjects from their own school
-- division_admin (school_id IS NULL) can see all subjects
CREATE POLICY "Subjects are viewable by school members"
  ON procurements.sms_subjects FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      school_id IS NULL
      OR school_id IN (
        SELECT u.school_id FROM procurements.sms_users u WHERE u.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM procurements.sms_users u
        WHERE u.user_id = auth.uid() AND u.type = 'division_admin'
      )
    )
  );

-- INSERT: only school_head, admin, registrar, division_admin can create subjects
-- and only for their own school (or any school for division_admin)
CREATE POLICY "Subjects are insertable by authorized roles"
  ON procurements.sms_subjects FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'admin', 'registrar', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

-- UPDATE: only school_head, admin, registrar, division_admin can update subjects
-- and only for their own school
CREATE POLICY "Subjects are updatable by authorized roles"
  ON procurements.sms_subjects FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'admin', 'registrar', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

-- DELETE: only school_head, admin, division_admin can delete subjects
CREATE POLICY "Subjects are deletable by authorized roles"
  ON procurements.sms_subjects FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'admin', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

-- ============================================================================
-- 2. FIX RLS POLICIES FOR sms_subject_schedules
-- ============================================================================

DROP POLICY IF EXISTS "Subject schedules are viewable by authenticated users" ON procurements.sms_subject_schedules;
DROP POLICY IF EXISTS "Subject schedules are insertable by admins" ON procurements.sms_subject_schedules;
DROP POLICY IF EXISTS "Subject schedules are updatable by admins" ON procurements.sms_subject_schedules;
DROP POLICY IF EXISTS "Subject schedules are deletable by admins" ON procurements.sms_subject_schedules;

-- SELECT: school members + division_admin
CREATE POLICY "Subject schedules are viewable by school members"
  ON procurements.sms_subject_schedules FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      school_id IS NULL
      OR school_id IN (
        SELECT u.school_id FROM procurements.sms_users u WHERE u.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM procurements.sms_users u
        WHERE u.user_id = auth.uid() AND u.type = 'division_admin'
      )
    )
  );

-- INSERT/UPDATE/DELETE: authorized roles only, school-scoped
CREATE POLICY "Subject schedules are insertable by authorized roles"
  ON procurements.sms_subject_schedules FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'admin', 'registrar', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

CREATE POLICY "Subject schedules are updatable by authorized roles"
  ON procurements.sms_subject_schedules FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'admin', 'registrar', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

CREATE POLICY "Subject schedules are deletable by authorized roles"
  ON procurements.sms_subject_schedules FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'admin', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

-- ============================================================================
-- 3. PER-SCHOOL UNIQUE SUBJECT CODE
-- ============================================================================

-- Drop the global unique constraint on code
ALTER TABLE procurements.sms_subjects DROP CONSTRAINT IF EXISTS sms_subjects_code_key;

-- Add per-school unique constraint (school_id + code)
-- Uses COALESCE to handle NULL school_id (legacy/division-level subjects)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_subjects_school_code
  ON procurements.sms_subjects (COALESCE(school_id, '0'), code);

-- ============================================================================
-- 4. COMPOSITE INDEX FOR SCHEDULE QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_subject_schedules_subject_school_year
  ON procurements.sms_subject_schedules (subject_id, school_id, school_year);

-- ============================================================================
-- 5. OPTIMIZED SINGLE-PASS CONFLICT DETECTION
-- ============================================================================
-- Replaces 3 sequential COUNT queries with a single scan that checks
-- room, teacher, and section conflicts in one pass.

CREATE OR REPLACE FUNCTION public.check_schedule_conflicts(
  p_room_id BIGINT,
  p_teacher_id BIGINT,
  p_section_id BIGINT,
  p_days_of_week INTEGER[],
  p_start_time TIME,
  p_end_time TIME,
  p_school_year TEXT,
  p_id BIGINT DEFAULT NULL
) RETURNS TABLE(
  conflict_type TEXT,
  conflict_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    CASE
      WHEN s.room_id = p_room_id THEN 'room'
      WHEN s.teacher_id = p_teacher_id THEN 'teacher'
      WHEN s.section_id = p_section_id THEN 'section'
    END::TEXT AS ctype,
    CASE
      WHEN s.room_id = p_room_id THEN 'Room is already scheduled at this time on one or more selected days'
      WHEN s.teacher_id = p_teacher_id THEN 'Teacher is already scheduled at this time on one or more selected days'
      WHEN s.section_id = p_section_id THEN 'Section is already scheduled at this time on one or more selected days'
    END::TEXT AS cmsg
  FROM procurements.sms_subject_schedules s
  WHERE s.school_year = p_school_year
    AND (p_id IS NULL OR s.id != p_id)
    AND public.days_overlap(s.days_of_week, p_days_of_week)
    AND public.times_overlap(s.start_time, s.end_time, p_start_time, p_end_time)
    AND (s.room_id = p_room_id OR s.teacher_id = p_teacher_id OR s.section_id = p_section_id);
END;
$$ LANGUAGE plpgsql;
