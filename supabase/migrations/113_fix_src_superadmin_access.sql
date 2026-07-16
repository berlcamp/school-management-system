-- ============================================================================
-- FIX: /reports/school-report-card fails with 403 for super admins.
-- ============================================================================
-- Migration 112 gated SRC writes on two branches:
--   (a) division_admin / division_type          -> full access
--   (b) school_head / assistant_school_head / admin / registrar, school-matched
--
-- A "super admin" is in neither list. The page SELECTs the draft (permitted:
-- the select policy admits any authenticated user), finds none, then INSERTs a
-- blank draft -> RLS rejects the INSERT -> PostgREST returns 403.
--
-- Super admin belongs in branch (a), not (b): on login AuthGuard.tsx replaces a
-- super admin's school_id with their persisted ACTIVE SCHOOL OVERRIDE, so the
-- school they are acting for routinely differs from their sms_users.school_id.
-- A school-matched branch would keep failing whenever the override is in play.
-- This is the same fix 094 applied to landing-hero uploads, and matches how
-- 088/089 treat ('division_admin', 'super admin') as full-access authors.
--
-- NOT widened to 'librarian': the SRC is a school head accountability document
-- that a librarian has no reason to author. AppSidebar showed them the link
-- (hasSchoolManagementAccess includes librarian) — the link is what was wrong,
-- and it is removed in the same change as this migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.can_write_src(p_submission_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_src_submissions s
    JOIN procurements.sms_users u ON u.user_id = auth.uid()
    WHERE s.id = p_submission_id
      AND u.is_active
      AND (
        u.type IN ('division_admin', 'division_type', 'super admin')
        OR (
          u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
          AND u.school_id = s.school_id
          AND s.status <> 'locked'
        )
      )
  );
$$;

-- INSERT cannot call can_write_src (no row id yet): gate on the target school.
DROP POLICY IF EXISTS "src_submissions_insert" ON procurements.sms_src_submissions;
CREATE POLICY "src_submissions_insert"
  ON procurements.sms_src_submissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND u.school_id = sms_src_submissions.school_id
          )
        )
    )
  );

-- Only division admins and super admins may delete a published SRC.
DROP POLICY IF EXISTS "src_submissions_delete" ON procurements.sms_src_submissions;
CREATE POLICY "src_submissions_delete"
  ON procurements.sms_src_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND u.type IN ('division_admin', 'division_type', 'super admin')
    )
  );
