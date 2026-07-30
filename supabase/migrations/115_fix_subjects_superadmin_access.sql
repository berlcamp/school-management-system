-- ============================================================================
-- FIX: /subjects fails with "new row violates row-level security policy for
--      table sms_subjects" for super admins.
-- ============================================================================
-- Migration 037 wrote the sms_subjects / sms_subject_schedules write policies
-- with two branches, and 095 recreated them to add 'assistant_school_head':
--   (a) division_admin                                  -> any school
--   (b) school_head / assistant_school_head / admin /
--       registrar, school-matched (u.school_id = school_id)
--
-- 'super admin' is in neither list, so every INSERT/UPDATE/DELETE it attempts
-- is rejected. The SELECT policies have the same hole in a quieter form: a
-- super admin only sees rows whose school_id equals their sms_users.school_id.
--
-- Super admin belongs in branch (a), not (b): AuthGuard.tsx (line 56) replaces
-- a super admin's school_id with their persisted ACTIVE SCHOOL OVERRIDE, so the
-- school they are acting for routinely differs from sms_users.school_id — a
-- school-matched branch would keep failing whenever the override is in play.
-- This is the same fix 113 applied to the School Report Card and 094 applied to
-- landing-hero uploads, and matches how 088/089 treat ('division_admin',
-- 'super admin') as full-access authors.
--
-- SECURITY FIX, found while testing the above: in 037/095 the school match was
-- written as an UNQUALIFIED `u.school_id = school_id` inside a subquery over
-- sms_users. Postgres resolves an unqualified name to the innermost scope, so
-- `school_id` bound to sms_users.school_id, not to the row being written —
-- pg_get_expr reports the live policy as `(u.school_id = u.school_id)`, which
-- is always true. School isolation on these two tables has therefore been a
-- no-op since 037: any school_head/admin/registrar could insert, update, or
-- delete ANOTHER school's subjects and schedules. Qualifying the outer table
-- (as 113 does) restores it. Expect this to start rejecting cross-school writes
-- that previously succeeded; that is the intended behaviour per invariant 1.
--
-- The bug concealed itself: `u.school_id = u.school_id` is bigint = bigint and
-- so type-checks fine. No casts are involved anywhere here — 013 converted
-- sms_users.school_id from TEXT to BIGINT and added sms_subjects.school_id as
-- BIGINT, and 016 added sms_subject_schedules.school_id as BIGINT, so all three
-- sides of every comparison below are BIGINT. (Invariant 11's ::TEXT cast is
-- for sms_school_settings.school_id, which is not touched here — adding it to
-- these policies raises "operator does not exist: text = bigint" at CREATE
-- POLICY time, since policy expressions are type-checked on creation.)
--
-- NOT widened to 'librarian' or 'teacher': neither authors subjects. Teachers
-- read subjects through the existing SELECT policy, which is unchanged for them.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. sms_subjects
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Subjects are viewable by school members" ON procurements.sms_subjects;
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
        WHERE u.user_id = auth.uid()
          AND u.type IN ('division_admin', 'super admin')
      )
    )
  );

DROP POLICY IF EXISTS "Subjects are insertable by authorized roles" ON procurements.sms_subjects;
CREATE POLICY "Subjects are insertable by authorized roles"
  ON procurements.sms_subjects FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar', 'division_admin', 'super admin')
        AND (u.type IN ('division_admin', 'super admin') OR u.school_id = sms_subjects.school_id)
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
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar', 'division_admin', 'super admin')
        AND (u.type IN ('division_admin', 'super admin') OR u.school_id = sms_subjects.school_id)
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
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'division_admin', 'super admin')
        AND (u.type IN ('division_admin', 'super admin') OR u.school_id = sms_subjects.school_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 2. sms_subject_schedules
-- ----------------------------------------------------------------------------
-- A super admin able to create a subject but not schedule it is a half-fix:
-- deleting a subject cascades its schedules, and the /subjects delete guard
-- counts them, so both tables must admit the same authors.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Subject schedules are viewable by school members" ON procurements.sms_subject_schedules;
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
        WHERE u.user_id = auth.uid()
          AND u.type IN ('division_admin', 'super admin')
      )
    )
  );

DROP POLICY IF EXISTS "Subject schedules are insertable by authorized roles" ON procurements.sms_subject_schedules;
CREATE POLICY "Subject schedules are insertable by authorized roles"
  ON procurements.sms_subject_schedules FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar', 'division_admin', 'super admin')
        AND (u.type IN ('division_admin', 'super admin') OR u.school_id = sms_subject_schedules.school_id)
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
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar', 'division_admin', 'super admin')
        AND (u.type IN ('division_admin', 'super admin') OR u.school_id = sms_subject_schedules.school_id)
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
        AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'division_admin', 'super admin')
        AND (u.type IN ('division_admin', 'super admin') OR u.school_id = sms_subject_schedules.school_id)
    )
  );
