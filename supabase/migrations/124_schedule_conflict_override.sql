-- ============================================================================
-- FORCED SCHEDULE CREATION (accepted conflicts / shared slots)
-- ============================================================================
-- Conflict detection was absolute: the BEFORE INSERT OR UPDATE trigger from
-- 004 (narrowed for Temporary rows in 117) RAISEs on any room / teacher /
-- section double-booking, so the timetable could not express arrangements that
-- schools genuinely run:
--
--   * two grade levels combined in one room under one teacher (multigrade,
--     small enrolment, or a shared MEP / TLE session)
--   * a hall or covered court used by more than one class at once
--
-- The client already warned about these before saving; there was simply no way
-- through. This adds one: `conflict_override`, set by the encoder ticking
-- "Create anyway" on the warning shown in the Add Schedule modal.
--
-- Semantics, deliberately narrow:
--
--   * The flag exempts THIS row from the trigger. It is not a global mute --
--     the overridden row still occupies its room/teacher/day/time and still
--     surfaces as a conflict to the NEXT person scheduling against it, who
--     must acknowledge it themselves. An override is one person accepting one
--     clash, not a hole in the timetable.
--   * The flag is a record, not a preference. The app writes TRUE only when a
--     conflict was actually detected at save time, so editing the clash away
--     clears it back to FALSE.
--   * Default FALSE, so every existing row and every ordinary insert keeps the
--     old behaviour untouched.
--
-- Nothing here relaxes the Temporary (teacher_id NULL) rules from 117; a
-- Temporary row that clashes on room can now be overridden like any other.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. The flag
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_subject_schedules
  ADD COLUMN IF NOT EXISTS conflict_override BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN procurements.sms_subject_schedules.conflict_override IS
  'TRUE = saved despite a detected room/teacher/section conflict, deliberately (e.g. two grade levels sharing one room). Exempts this row from the conflict trigger only; the row still counts as a conflict for schedules created after it.';

-- ----------------------------------------------------------------------------
-- 2. Honour the flag in the trigger
-- ----------------------------------------------------------------------------
-- Only the early return is new; the body is otherwise 117's. check_schedule_
-- conflicts() itself is left alone on purpose -- it stays a pure "what clashes
-- with this slot?" report, which is what the UI reads through the client-side
-- mirror in lib/utils/scheduleConflicts.ts.
CREATE OR REPLACE FUNCTION public.check_schedule_conflicts_trigger()
RETURNS TRIGGER AS $$
DECLARE
  conflict_record RECORD;
  conflict_messages TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Encoder accepted the clash on this row; skip enforcement for it alone.
  IF COALESCE(NEW.conflict_override, FALSE) THEN
    RETURN NEW;
  END IF;

  -- Check for conflicts
  FOR conflict_record IN
    SELECT * FROM public.check_schedule_conflicts(
      NEW.room_id,
      NEW.teacher_id,
      NEW.section_id,
      NEW.days_of_week,
      NEW.start_time,
      NEW.end_time,
      NEW.school_year,
      NEW.id
    )
  LOOP
    conflict_messages := array_append(conflict_messages, conflict_record.conflict_message);
  END LOOP;

  -- If conflicts found, raise exception
  IF array_length(conflict_messages, 1) > 0 THEN
    RAISE EXCEPTION 'Schedule conflict detected: %', array_to_string(conflict_messages, '; ');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Verification
-- ----------------------------------------------------------------------------
-- Column should read boolean / NOT NULL / default false
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'procurements'
  AND table_name   = 'sms_subject_schedules'
  AND column_name  = 'conflict_override';

-- No existing row should be silently exempted
SELECT COUNT(*) AS overridden_rows
FROM procurements.sms_subject_schedules
WHERE conflict_override;
