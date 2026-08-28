-- ============================================================================
-- CLASS RECORD — A RAW SCORE MAY NOT EXCEED ITS HIGHEST POSSIBLE SCORE
-- ============================================================================
-- 080 gave sms_class_record_scores.raw_score a lower bound only
-- (CHECK raw_score >= 0). There was no upper bound anywhere, and a plain CHECK
-- cannot be one: the ceiling is sms_class_record_items.max_score, which lives
-- in a different table — the 136 situation exactly, and why this is a trigger.
--
-- What the hole cost. The component percentage score is
--
--     WW / PT :  PS = SUM(raw) / SUM(max) × 100
--     ST      :  PS = SUM( (raw_i / max_i × 100) × weight_i ) / SUM(weight_i)
--
-- so one score above its item's HPS carries the whole component past 100%, the
-- Weighted Score past the component's own weight ceiling, and the inflated
-- figure lands in the Initial Grade, the Term Grade and — through
-- post_class_record_grades — in sms_grades itself. Observed in production: a
-- Performance Task with HPS 50 holding 80, giving PT PS = 109 and WS = 54.57
-- against a 50% component. The class record is the source of a posted grade,
-- so this is not a display defect.
--
-- The client (ClassRecordTable) now refuses the entry first, but the anon key
-- ships in the browser bundle: a gate that lives only in the page is lifted
-- from the console, which is 161's lesson. This is the enforced one.
--
-- Two ways in, so two triggers — the second is the one that is easy to miss:
--   1. write a score above the item's HPS;
--   2. leave the scores alone and pull the item's HPS down underneath them.
--
-- NOTHING IS BACKFILLED AND NOTHING IS REWRITTEN. This migration contains no
-- DML at all. Rows that already violate the rule keep their values and are
-- neither corrected nor deleted — correcting a learner's encoded score is the
-- teacher's decision, not a migration's. They are simply refused the next time
-- somebody writes that score, and the class record page already renders them
-- red so they can be found. An UPDATE that leaves raw_score / max_score
-- untouched is deliberately let through, so no existing row becomes
-- un-editable in unrelated ways (renaming an item, say).
--
-- Read-only — count the rows that already violate the rule, before applying:
--
--   SELECT i.class_record_id, i.component, i.label,
--          i.max_score, s.raw_score, s.student_id
--     FROM procurements.sms_class_record_scores s
--     JOIN procurements.sms_class_record_items  i ON i.id = s.item_id
--    WHERE s.raw_score IS NOT NULL
--      AND s.raw_score > i.max_score
--    ORDER BY i.class_record_id, i.component, i.position;
--
-- SECURITY DEFINER with a pinned search_path, per 138: the check reads
-- sms_class_record_items, and 080's policies are `auth.role() =
-- 'authenticated'` with the scoping done in the app layer. Under invoker
-- rights a caller who could not SELECT the item row would read a NULL HPS and
-- the guard would silently pass — a validation that answers a different
-- question per role is worse than none.
--
-- Scope: two functions and two triggers, both new. No table, column,
-- constraint, policy or existing trigger is replaced, and no row is touched.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. A score is written: it must fall within its item's HPS.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.check_class_record_score_within_hps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_max   NUMERIC;
  v_label TEXT;
BEGIN
  -- NULL = not yet entered (080's own meaning); nothing to check.
  IF NEW.raw_score IS NULL THEN
    RETURN NEW;
  END IF;

  -- Grandfathering: an UPDATE that does not move the score is not this
  -- trigger's business, so a row that already violates the rule can still be
  -- carried along by an unrelated write instead of becoming a dead end.
  IF TG_OP = 'UPDATE' AND NEW.raw_score IS NOT DISTINCT FROM OLD.raw_score THEN
    RETURN NEW;
  END IF;

  SELECT i.max_score, COALESCE(NULLIF(i.label, ''), i.component)
    INTO v_max, v_label
    FROM procurements.sms_class_record_items i
   WHERE i.id = NEW.item_id;

  -- A missing item is the FK's business, not ours.
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.raw_score > v_max THEN
    RAISE EXCEPTION
      'Score % is above the highest possible score (%) for "%".',
      NEW.raw_score, v_max, v_label
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION procurements.check_class_record_score_within_hps() IS
  'Refuses a class record raw_score above its item''s max_score (migration 162). The ceiling lives in another table, so this cannot be a CHECK.';

DROP TRIGGER IF EXISTS check_class_record_score_within_hps_trigger
  ON procurements.sms_class_record_scores;

CREATE TRIGGER check_class_record_score_within_hps_trigger
  BEFORE INSERT OR UPDATE OF raw_score, item_id
  ON procurements.sms_class_record_scores
  FOR EACH ROW
  EXECUTE FUNCTION procurements.check_class_record_score_within_hps();

-- ----------------------------------------------------------------------------
-- 2. An item's HPS is lowered: it may not drop under a score already encoded.
--    The same invariant from the other side. INSERT is not covered because a
--    brand-new item has no scores yet.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.check_class_record_hps_above_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_highest NUMERIC;
BEGIN
  IF NEW.max_score IS NOT DISTINCT FROM OLD.max_score THEN
    RETURN NEW;
  END IF;

  -- Raising the ceiling can never break the rule.
  IF NEW.max_score >= OLD.max_score THEN
    RETURN NEW;
  END IF;

  SELECT MAX(s.raw_score)
    INTO v_highest
    FROM procurements.sms_class_record_scores s
   WHERE s.item_id = NEW.id
     AND s.raw_score IS NOT NULL;

  IF v_highest IS NOT NULL AND v_highest > NEW.max_score THEN
    RAISE EXCEPTION
      'A learner already scored % on "%" — lower those scores before setting the highest possible score to %.',
      v_highest, COALESCE(NULLIF(NEW.label, ''), NEW.component), NEW.max_score
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION procurements.check_class_record_hps_above_scores() IS
  'Refuses lowering a class record item''s max_score below a raw_score already encoded against it (migration 162).';

DROP TRIGGER IF EXISTS check_class_record_hps_above_scores_trigger
  ON procurements.sms_class_record_items;

CREATE TRIGGER check_class_record_hps_above_scores_trigger
  BEFORE UPDATE OF max_score
  ON procurements.sms_class_record_items
  FOR EACH ROW
  EXECUTE FUNCTION procurements.check_class_record_hps_above_scores();
