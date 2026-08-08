-- ============================================================================
-- Migration 129: Close the Requests module's access holes
-- ============================================================================
--
-- APPLY AFTER 127. This migration revokes EXECUTE on the three transfer RPCs
-- that 127 rewrote; the code that replaces those direct calls (server actions
-- in lib/requests/record-actions.ts) ships in the same change.
--
-- ---------------------------------------------------------------------------
-- What is wrong today
-- ---------------------------------------------------------------------------
--
-- 1. Migration 049 gave `anon` blanket access to the document-request tables:
--
--      sms_requests_public_read          SELECT  TO anon, authenticated  USING (true)
--      sms_requests_public_insert        INSERT  TO anon, authenticated  WITH CHECK (true)
--      sms_requests_authenticated_update UPDATE  TO authenticated        USING (true)
--      sms_request_attachments_all       ALL     TO anon, authenticated  USING (true) WITH CHECK (true)
--      sms_request_logs_all              ALL     TO anon, authenticated  USING (true) WITH CHECK (true)
--
--    NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the browser bundle, so every one of
--    those is reachable by anybody on the internet: read every learner name,
--    LRN, requester name, contact number, email and purpose across the whole
--    division, and insert/update/delete rows in the audit log and the
--    attachment index at will. `..._authenticated_update USING (true)` also
--    lets any signed-in account — a teacher, a librarian — rewrite the status
--    of any request directly, going around the state machine in
--    updateRequestStatus entirely.
--
-- 2. respond_to_record_request / cancel_record_request / remove_transfer_student
--    are SECURITY DEFINER and granted to `authenticated`, and none of them
--    checks who is calling — they trust the responder id passed in as an
--    argument. RLS cannot help: a definer function runs as its owner, so the
--    "Record requests updatable by origin school" policy never applies. Any
--    signed-in user could approve a transfer on behalf of any school, or call
--    remove_transfer_student to drop a learner's enrollment and move them back
--    to their previous school.
--
-- ---------------------------------------------------------------------------
-- What replaces it
-- ---------------------------------------------------------------------------
--
-- The public portal never needed table access: submitting and tracking both
-- run server-side on the service-role client (lib/requests/actions.ts), and
-- the last anon read — the "you already have a request for this document"
-- check — moved into getExistingRequestsForLrn in the same file. So `anon`
-- loses these tables completely.
--
-- Staff keep SELECT, scoped to their own school, because the queue, the detail
-- modal, the dashboards and the sidebar badge all read through the RLS client.
-- Every WRITE goes through a server action that authenticates the caller
-- (lib/requests/auth.ts), so no write policy is granted to anyone.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- Drops 5 POLICIES on 3 tables and REVOKEs EXECUTE on 3 FUNCTIONS. It creates
-- no table, drops no table, drops no column, and modifies NO ROWS — there is
-- no DML in this file at all. Reversible by re-running the policy block from
-- migration 049 and re-granting EXECUTE.
--
-- Before applying, count the rows that become invisible to school staff —
-- requests whose school_id was never set (a public submission whose LRN did
-- not resolve to a school). They stay readable by division staff, and the
-- server actions still let school staff act on them (canActOnSchool treats a
-- NULL school as unowned), but they will not appear in a school's list:
--
--   SELECT count(*) FROM procurements.sms_requests WHERE school_id IS NULL;
--
-- If that count is not zero, decide where those belong before applying.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. sms_requests
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "sms_requests_public_read"          ON procurements.sms_requests;
DROP POLICY IF EXISTS "sms_requests_public_insert"        ON procurements.sms_requests;
DROP POLICY IF EXISTS "sms_requests_authenticated_update" ON procurements.sms_requests;

-- Staff read their own school's requests. Division staff read everything, and
-- so pick up the unattributed (school_id IS NULL) rows.
CREATE POLICY "sms_requests_staff_read"
  ON procurements.sms_requests FOR SELECT
  TO authenticated
  USING (
    school_id = (
      SELECT u.school_id FROM procurements.sms_users u
      WHERE u.user_id = auth.uid() LIMIT 1
    )
    OR (
      SELECT u.type FROM procurements.sms_users u
      WHERE u.user_id = auth.uid() LIMIT 1
    ) IN ('division_admin', 'division_type', 'super admin')
  );

-- No INSERT/UPDATE/DELETE policy on purpose: every write in this module runs
-- through a server action on the service-role client, which is not subject to
-- RLS. Adding one here would re-open the hole this migration closes.

-- ---------------------------------------------------------------------------
-- 2. sms_request_attachments — visible with the request they belong to
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "sms_request_attachments_all" ON procurements.sms_request_attachments;

CREATE POLICY "sms_request_attachments_staff_read"
  ON procurements.sms_request_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_requests r
      WHERE r.id = request_id
        AND (
          r.school_id = (
            SELECT u.school_id FROM procurements.sms_users u
            WHERE u.user_id = auth.uid() LIMIT 1
          )
          OR (
            SELECT u.type FROM procurements.sms_users u
            WHERE u.user_id = auth.uid() LIMIT 1
          ) IN ('division_admin', 'division_type', 'super admin')
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. sms_request_logs — the audit trail; readable with its request, never
--    writable from a client. anon could previously delete from this table.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "sms_request_logs_all" ON procurements.sms_request_logs;

CREATE POLICY "sms_request_logs_staff_read"
  ON procurements.sms_request_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_requests r
      WHERE r.id = request_id
        AND (
          r.school_id = (
            SELECT u.school_id FROM procurements.sms_users u
            WHERE u.user_id = auth.uid() LIMIT 1
          )
          OR (
            SELECT u.type FROM procurements.sms_users u
            WHERE u.user_id = auth.uid() LIMIT 1
          ) IN ('division_admin', 'division_type', 'super admin')
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Table-level grants — belt and braces alongside the policies above
-- ---------------------------------------------------------------------------

REVOKE ALL ON procurements.sms_requests             FROM anon;
REVOKE ALL ON procurements.sms_request_attachments  FROM anon;
REVOKE ALL ON procurements.sms_request_logs         FROM anon;

REVOKE INSERT, UPDATE, DELETE ON procurements.sms_requests            FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON procurements.sms_request_attachments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON procurements.sms_request_logs        FROM authenticated;

GRANT SELECT ON procurements.sms_requests             TO authenticated;
GRANT SELECT ON procurements.sms_request_attachments  TO authenticated;
GRANT SELECT ON procurements.sms_request_logs         TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. The transfer RPCs — service-role only from here on
-- ---------------------------------------------------------------------------
--
-- These stay SECURITY DEFINER and their bodies are untouched (127 owns those).
-- What changes is who may call them: the server actions in
-- lib/requests/record-actions.ts resolve the acting staff member from the
-- session cookie and check their school against the request first. Revoking
-- EXECUTE is what makes that check impossible to skip.
--
-- enroll_student_with_record_request is deliberately NOT revoked: the
-- enrollment wizard still calls it directly, and it opens a request rather
-- than answering one. It has the same unchecked-caller shape and should get
-- the same treatment in a follow-up.

REVOKE EXECUTE ON FUNCTION procurements.respond_to_record_request(BIGINT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION procurements.cancel_record_request(BIGINT, BIGINT)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION procurements.remove_transfer_student(BIGINT, BIGINT, TEXT)         FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION procurements.respond_to_record_request(BIGINT, TEXT, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION procurements.cancel_record_request(BIGINT, BIGINT)                 TO service_role;
GRANT EXECUTE ON FUNCTION procurements.remove_transfer_student(BIGINT, BIGINT, TEXT)         TO service_role;
