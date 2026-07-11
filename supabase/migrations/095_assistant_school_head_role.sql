-- ============================================================================
-- ADD "assistant_school_head" ROLE
-- ============================================================================
-- New staff role "Assistant School Principal" with the SAME access as
-- "school_head". This migration:
--   1. Allows the value in the sms_users type CHECK constraint.
--   2. Recreates every RLS policy that gates on 'school_head' so the new
--      role is granted identical database-level access.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. Allow the new value on sms_users.type
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check
  CHECK (type IN (
    'school_head',
    'assistant_school_head',
    'teacher',
    'registrar',
    'admin',
    'super admin',
    'division_admin',
    'division_type',
    'librarian'
  ));

-- ----------------------------------------------------------------------------
-- 2. sms_subjects RLS (originally migration 037)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Subjects are insertable by authorized roles" ON procurements.sms_subjects;
CREATE POLICY "Subjects are insertable by authorized roles"
  ON procurements.sms_subjects FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

DROP POLICY IF EXISTS "Subjects are updatable by authorized roles" ON procurements.sms_subjects;
CREATE POLICY "Subjects are updatable by authorized roles"
  ON procurements.sms_subjects FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

DROP POLICY IF EXISTS "Subjects are deletable by authorized roles" ON procurements.sms_subjects;
CREATE POLICY "Subjects are deletable by authorized roles"
  ON procurements.sms_subjects FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 3. sms_subject_schedules RLS (originally migration 037)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Subject schedules are insertable by authorized roles" ON procurements.sms_subject_schedules;
CREATE POLICY "Subject schedules are insertable by authorized roles"
  ON procurements.sms_subject_schedules FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

DROP POLICY IF EXISTS "Subject schedules are updatable by authorized roles" ON procurements.sms_subject_schedules;
CREATE POLICY "Subject schedules are updatable by authorized roles"
  ON procurements.sms_subject_schedules FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

DROP POLICY IF EXISTS "Subject schedules are deletable by authorized roles" ON procurements.sms_subject_schedules;
CREATE POLICY "Subject schedules are deletable by authorized roles"
  ON procurements.sms_subject_schedules FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'division_admin')
        AND (u.type = 'division_admin' OR u.school_id = school_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 4. sms_division_report_submissions RLS + helper (originally migration 072)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "submissions_insert" ON procurements.sms_division_report_submissions;
CREATE POLICY "submissions_insert"
  ON procurements.sms_division_report_submissions FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin','division_type')
          OR (
            u.type IN ('school_head','assistant_school_head','admin','registrar')
            AND u.school_id = sms_division_report_submissions.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "submissions_update" ON procurements.sms_division_report_submissions;
CREATE POLICY "submissions_update"
  ON procurements.sms_division_report_submissions FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin','division_type')
          OR (
            u.type IN ('school_head','assistant_school_head','admin','registrar')
            AND u.school_id = sms_division_report_submissions.school_id
            AND sms_division_report_submissions.status <> 'locked'
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION procurements.can_write_submission(p_submission_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_division_report_submissions s
    JOIN procurements.sms_users u ON u.user_id = auth.uid()
    WHERE s.id = p_submission_id
      AND u.is_active
      AND (
        u.type IN ('division_admin','division_type')
        OR (
          u.type IN ('school_head','assistant_school_head','admin','registrar')
          AND u.school_id = s.school_id
          AND s.status <> 'locked'
        )
      )
  );
$$;
