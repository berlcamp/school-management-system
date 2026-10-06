-- ============================================================================
-- 202 — Super admin and the division office can read transfer record requests
-- ============================================================================
-- 038's SELECT policy on sms_record_requests admits a row when the caller's
-- sms_users.school_id is the requesting or origin school, or the caller is
-- `division_admin`. `super admin` and `division_type` are in neither branch.
--
-- For `super admin` that empties Manage Requests outright: a super admin
-- switches school through a browser-side override (AuthGuard, per 094/113),
-- so the Outgoing / Incoming tabs filter on the switched school while this
-- policy still binds to the school stored on the sms_users row. Unless the
-- two happen to match, every request reads as missing — the rows exist and
-- are still pending, the query just returns nothing and the page shows the
-- empty state (no error is raised; RLS filters silently).
--
-- The writes were never the gap: since 129 every write goes through
-- lib/requests/record-actions.ts on the service role, whose gate
-- (`canActOnSchool`, lib/requests/auth.ts) already admits all three division
-- roles. This aligns the READ with that same set — `DIVISION_TYPES` there —
-- in the full-access branch, not school-matched, per 113/115.
--
-- The two school branches are 038's verbatim. Nothing else moves: the INSERT,
-- UPDATE and DELETE policies are untouched (the app does not write this table
-- through RLS), no row is modified, no function or trigger replaced.
-- ============================================================================

DROP POLICY IF EXISTS "Record requests viewable by involved schools"
  ON procurements.sms_record_requests;

CREATE POLICY "Record requests viewable by involved schools"
  ON procurements.sms_record_requests FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      requesting_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
      OR origin_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
      OR (SELECT type FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
           IN ('division_admin', 'division_type', 'super admin')
    )
  );
