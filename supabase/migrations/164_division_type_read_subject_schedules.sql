-- ============================================================================
-- 164 — division_type in the school-scoped SELECT policy on subject schedules
-- ============================================================================
-- ⚠ THIS CHANGES NOTHING TODAY. It is a safeguard, and it is OPTIONAL. Read the
-- whole header before deciding to apply it.
--
-- WHY IT WAS WRITTEN
-- The school-level Reports module (/school-reports) is now open to the division
-- office: they pick a school and generate that one school's reports. Two of
-- those reports — "Subjects Handled by Teacher" and "Teaching Load" — read
-- `sms_subject_schedules` straight from the client, so they return whatever RLS
-- lets the caller see. 115's policy "Subject schedules are viewable by school
-- members" admits a row when it belongs to the caller's OWN school, or when the
-- caller is `division_admin` / `super admin`. `division_type` — the division
-- office's read-only account since 067 — is in neither branch and has a NULL
-- `school_id` besides, so on the strength of that policy alone both reports
-- would come back empty for them, with no error: a report that silently says a
-- school timetables nothing at all.
--
-- WHY IT IS A NO-OP
-- That policy is not the only SELECT policy on the table. Migration 041
-- deliberately relaxed reads to `auth.role() = 'authenticated'` — matching how
-- sms_sections / sms_students are scoped in the app rather than in the database
-- — and 115 added its school-scoped policy WITHOUT dropping 041's. Postgres ORs
-- multiple permissive policies, so the broad one wins and every authenticated
-- user, `division_type` included, can already read every school's schedules.
-- Both policies are present in the live schema; verify with:
--
--   SELECT polname, pg_get_expr(polqual, polrelid)
--   FROM pg_policy
--   WHERE polrelid = 'procurements.sms_subject_schedules'::regclass
--     AND polcmd = 'r';
--
-- WHAT THIS DOES
-- Adds `division_type` to the school-scoped policy, beside the two roles it
-- already trusts division-wide. This is the same read scope 071/072/074
-- (division reports), 112 (SRC) and 118 (KPI) already grant the role — every
-- one of them pairs it with `division_admin` — so nothing new is said about who
-- the division office is. Its only effect is on the day someone drops 041's
-- permissive policy to tighten reads: without this, that change would silently
-- empty two reports for the division office. Applying it now costs nothing;
-- leaving it unapplied costs nothing either, until that day.
--
-- WHAT THIS DOES NOT DO
-- It does not drop 041's permissive policy, and so does not tighten anything —
-- restricting cross-school reads is a separate decision with a much wider blast
-- radius than this module. INSERT / UPDATE / DELETE are untouched: the division
-- office reads a school's timetable, it does not write one. No other table,
-- column, trigger or function is touched, and no DML runs. 138's double-booking
-- check is SECURITY DEFINER and never depended on the caller's visibility.
-- ============================================================================

DROP POLICY IF EXISTS "Subject schedules are viewable by school members"
  ON procurements.sms_subject_schedules;

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
          AND u.type IN ('division_admin', 'division_type', 'super admin')
      )
    )
  );
