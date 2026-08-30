-- ============================================================================
-- 170. A division-shared saved report is visible to the division, not to all
-- ============================================================================
--
-- WHY NOW
-- -------
-- 167 wrote the SELECT policy as
--
--     owner_id = <the caller> OR is_division_shared
--
-- and that second branch has no role test on it. It was written when the Report
-- Generator lived only at /division/reports/builder, where every reader is the
-- division office, so "shared" and "shared with the division" were the same
-- sentence. Opening the builder to schools under /school-reports makes them
-- different sentences: as written, a school head — or any authenticated user —
-- can list the division office's saved reports.
--
-- No learner row leaks through this: a definition holds a name, a description
-- and a filter set, and running one still goes through
-- `can_run_division_report`, which refuses a school user any scope but their
-- own. But a filter set is not nothing — "Learners where Barangay is X and PWD
-- is Yes" describes what the division office is looking into, and the name
-- often says why. It should not be readable division-wide by everyone with a
-- login.
--
-- WHAT THIS DOES
-- --------------
-- One policy replaced: the `is_division_shared` branch now also requires the
-- reader to be division office. The author's own rows are untouched, and so is
-- every write policy — `can_manage_report_definition` already restricted
-- editing a shared row to division_admin / super admin.
--
-- A SCHOOL USER'S SAVED REPORTS ARE PRIVATE TO THEM, DELIBERATELY
-- --------------------------------------------------------------
-- There is no school tier here yet. A school head's saved report is their own;
-- the builder does not offer them the sharing checkbox at all. Sharing within a
-- school is a real thing to want — 160 built exactly that for exams — but it is
-- a tier with its own rules (who may edit it, what happens when its author
-- transfers), not a checkbox to add in passing. `is_division_shared` stays what
-- its name says.
--
-- ROWS AFFECTED: 0. One policy replaced; no table, column, trigger or function.
-- ============================================================================

DROP POLICY IF EXISTS "Report definitions are viewable by owner or division"
  ON procurements.sms_report_definitions;

CREATE POLICY "Report definitions are viewable by owner or division"
  ON procurements.sms_report_definitions
  FOR SELECT TO authenticated
  USING (
    owner_id = procurements.sms_session_user_id()
    OR (
      is_division_shared
      AND EXISTS (
        SELECT 1 FROM procurements.sms_users u
        WHERE u.id = procurements.sms_session_user_id()
          -- `type` is the ACTIVE role (invariant 12).
          AND u.type IN ('division_admin', 'division_type', 'super admin')
      )
    )
  );
