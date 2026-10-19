-- ============================================================================
-- 212: SBFP Feedback Mechanism — issues and concerns about the programme
-- ============================================================================
-- The feeding programme has no place to write down what goes wrong: a parent
-- complaining about the food, spoiled packs on delivery, a learner refusing
-- milk, a kitchen without water. Schools kept these in a notebook. This adds a
-- log of them per programme — one row per issue or concern — with what was
-- done about it and whether it is settled, printable from the Feedback
-- Mechanism tab.
--
--   sms_sbfp_feedback  one issue / concern: date received, who raised it
--                      (source + optional name), category, the concern, the
--                      action taken, status (open / in_progress / resolved)
--                      and the date resolved.
--
-- `source` and `category` are free TEXT, app-validated in
-- lib/constants/sbfp.ts (the 119/132 precedent): they carry no behaviour, and
-- a revised list must not invalidate rows already logged. `status` is
-- CHECK-constrained (133/153) because the screen and the printout count by it.
--
-- Who writes: anyone who may encode in the programme — a manager (209's
-- sbfp_can_manage) or a teacher of the school (210's sbfp_is_school_teacher).
-- A teacher edits and removes only the entries they logged; a manager, every
-- entry. created_by is stamped from auth.uid(), never from the payload.
-- SELECT is open to authenticated, as the rest of the SBFP tables are (209), so
-- the school head and the division office read every entry.
--
-- Nothing existing is touched: one new table, one stamp trigger, one helper.
-- No ALTER of a pre-existing table, no policy replaced, no DML.
-- ============================================================================

SET search_path TO procurements, public;

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_feedback (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_programs(id) ON DELETE CASCADE,
  received_on DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT,
  raised_by TEXT,
  category TEXT,
  concern TEXT NOT NULL CHECK (btrim(concern) <> ''),
  action_taken TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolved_on DATE,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_sbfp_feedback_resolved_after_received
    CHECK (resolved_on IS NULL OR resolved_on >= received_on)
);

CREATE INDEX IF NOT EXISTS idx_sms_sbfp_feedback_program
  ON procurements.sms_sbfp_feedback(program_id);

DROP TRIGGER IF EXISTS update_sms_sbfp_feedback_updated_at ON procurements.sms_sbfp_feedback;
CREATE TRIGGER update_sms_sbfp_feedback_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The author is whoever inserts the row; it never changes afterwards, and the
-- entry never moves to another programme.
CREATE OR REPLACE FUNCTION procurements.sbfp_stamp_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_actor BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      SELECT u.id INTO v_actor FROM procurements.sms_users u WHERE u.user_id = auth.uid();
      NEW.created_by := v_actor;
    END IF;
  ELSE
    IF NEW.program_id IS DISTINCT FROM OLD.program_id THEN
      RAISE EXCEPTION 'A feedback entry cannot be moved to another programme.';
    END IF;
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sbfp_stamp_feedback ON procurements.sms_sbfp_feedback;
CREATE TRIGGER sbfp_stamp_feedback
  BEFORE INSERT OR UPDATE ON procurements.sms_sbfp_feedback
  FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_stamp_feedback();

-- May the caller log feedback on this programme? A manager, or a teacher of
-- the programme's school.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_log_feedback(p_program_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id)
      OR EXISTS (
        SELECT 1
          FROM procurements.sms_sbfp_programs p
         WHERE p.id = p_program_id
           AND procurements.sbfp_is_school_teacher(p.school_id)
      );
$$;

-- May the caller edit / remove this entry? A manager, or its author while
-- still a teacher of the school.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_edit_feedback(
  p_program_id BIGINT,
  p_created_by BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id)
      OR (
        procurements.sbfp_can_log_feedback(p_program_id)
        AND EXISTS (
          SELECT 1 FROM procurements.sms_users u
           WHERE u.user_id = auth.uid() AND u.id = p_created_by
        )
      );
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_stamp_feedback() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_can_log_feedback(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_can_edit_feedback(BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_log_feedback(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_edit_feedback(BIGINT, BIGINT) TO authenticated;

ALTER TABLE procurements.sms_sbfp_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sbfp_feedback_select" ON procurements.sms_sbfp_feedback;
CREATE POLICY "sbfp_feedback_select" ON procurements.sms_sbfp_feedback
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_feedback_insert" ON procurements.sms_sbfp_feedback;
CREATE POLICY "sbfp_feedback_insert" ON procurements.sms_sbfp_feedback
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_can_log_feedback(program_id));
DROP POLICY IF EXISTS "sbfp_feedback_update" ON procurements.sms_sbfp_feedback;
CREATE POLICY "sbfp_feedback_update" ON procurements.sms_sbfp_feedback
  FOR UPDATE TO authenticated
  USING (procurements.sbfp_can_edit_feedback(program_id, created_by))
  WITH CHECK (procurements.sbfp_can_edit_feedback(program_id, created_by));
DROP POLICY IF EXISTS "sbfp_feedback_delete" ON procurements.sms_sbfp_feedback;
CREATE POLICY "sbfp_feedback_delete" ON procurements.sms_sbfp_feedback
  FOR DELETE TO authenticated
  USING (procurements.sbfp_can_edit_feedback(program_id, created_by));

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_sbfp_feedback TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_sbfp_feedback_id_seq TO authenticated;

COMMENT ON TABLE procurements.sms_sbfp_feedback IS
  'SBFP Feedback Mechanism (migration 212): issues and concerns about the feeding programme, the action taken and their status.';

-- Verification: the Supabase SQL editor shows only this last result.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'procurements'
   AND c.relname = 'sms_sbfp_feedback';
