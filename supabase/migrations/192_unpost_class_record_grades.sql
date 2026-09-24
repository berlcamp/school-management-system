-- ============================================================================
-- 192 — Unpost a class record's grades
-- ============================================================================
-- A teacher trying the class record out posts a quarter of made-up scores, and
-- the adviser, the report card, SF9 and the student portal all start showing
-- them. Nothing could take them back:
--
--   * `post_class_record_grades` (080 → 175) only ever INSERTs / UPDATEs. It
--     skips a learner with no score, so clearing the scores and posting again
--     leaves every test grade exactly where it was.
--   * The Grade Entry table writes a 0 ("Failed") into a blank cell rather than
--     removing the row, which is worse than the test grade.
--
-- So this adds the inverse of posting.
--
-- 1. `unpost_class_record_grades(p_class_record_id)` DELETEs the `sms_grades`
--    rows for the record's (subject, section, grading_period, school_year) —
--    exactly the slot the post writes into — and sets `is_posted = false`.
--    `sms_class_records` is UNIQUE on that same four-tuple, so the slot belongs
--    to this one record and nothing else posts into it. **Everything on the
--    class record itself is kept**: items, scores and weights are untouched, so
--    an unpost is reversed by posting again.
--    Scoped to the slot and not to the learners who currently have scores, on
--    purpose: a teacher who cleared the test scores first and unposted second
--    must still get the grades removed.
--
-- 2. `sms_class_records.unposted_at` (nullable, nothing backfilled). The class
--    record auto-posts ~1.5 s after every score edit, so without this an
--    unposted record would re-post itself the moment the teacher cleared the
--    first test score — the exact moment they are trying to get it off the
--    card. The client pauses the auto-post while `is_posted = false AND
--    unposted_at IS NOT NULL`, and a manual Post (which sets `is_posted`) lifts
--    the pause. `is_posted` alone cannot carry this: a brand-new record is also
--    `is_posted = false` and must auto-post as it always has. NULL on every
--    existing row, so no record's behaviour moves on apply.
--
-- Who may unpost: the record's own teacher, anyone the class record screen
-- itself lets edit it (the subject's scheduled teacher or the section's
-- adviser for that school year), and `super admin`. Checked here and not only
-- in the app, because the RPC is SECURITY DEFINER and runs past RLS, and the
-- anon key ships in the browser bundle (the 161 lesson). A school head's view
-- of the class record is read-only and stays so.
--
-- Rows touched on apply: none. One nullable ADD COLUMN, one new function.
-- ============================================================================

ALTER TABLE procurements.sms_class_records
  ADD COLUMN IF NOT EXISTS unposted_at TIMESTAMPTZ;

COMMENT ON COLUMN procurements.sms_class_records.unposted_at IS
  'When the grades were last taken back off the card (migration 192). While '
  'is_posted is false and this is set, the class record does not auto-post.';

CREATE OR REPLACE FUNCTION procurements.unpost_class_record_grades(p_class_record_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO procurements, public
AS $$
DECLARE
  rec       procurements.sms_class_records%ROWTYPE;
  v_caller  procurements.sms_users%ROWTYPE;
  v_removed INTEGER;
BEGIN
  SELECT * INTO rec FROM procurements.sms_class_records WHERE id = p_class_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class record % not found', p_class_record_id;
  END IF;

  SELECT * INTO v_caller FROM procurements.sms_users WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
       v_caller.type = 'super admin'
    OR v_caller.id = rec.teacher_id
    OR EXISTS (
         SELECT 1 FROM procurements.sms_subject_schedules ss
          WHERE ss.teacher_id  = v_caller.id
            AND ss.subject_id  = rec.subject_id
            AND ss.section_id  = rec.section_id
            AND ss.school_year = rec.school_year
       )
    OR EXISTS (
         SELECT 1 FROM procurements.sms_sections sec
          WHERE sec.id = rec.section_id
            AND sec.section_adviser_id = v_caller.id
            AND sec.school_year = rec.school_year
       )
  ) THEN
    RAISE EXCEPTION 'Only the teacher of this class record may unpost its grades.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM procurements.sms_grades g
   WHERE g.subject_id     = rec.subject_id
     AND g.section_id     = rec.section_id
     AND g.grading_period = rec.grading_period
     AND g.school_year    = rec.school_year;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  UPDATE procurements.sms_class_records
     SET is_posted = false, unposted_at = NOW(), updated_at = NOW()
   WHERE id = rec.id;

  RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION procurements.unpost_class_record_grades(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.unpost_class_record_grades(BIGINT) TO authenticated;
