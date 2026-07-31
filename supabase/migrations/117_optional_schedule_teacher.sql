-- ============================================================================
-- OPTIONAL TEACHER ON SUBJECT SCHEDULES ("Temporary" schedules)
-- ============================================================================
-- Schools build next year's timetable before teacher assignments are settled.
-- This allows a schedule row to be created with no teacher; the UI badges such
-- rows as "Temporary" (tooltip: "No teacher specified").
--
-- Three things have to change together, because any one of them alone still
-- blocks the insert:
--
--   1. teacher_id NOT NULL  -> nullable.
--
--   2. The BEFORE INSERT OR UPDATE trigger from 004
--      (check_schedule_conflicts_before_insert_update) RAISEs an exception on
--      room / teacher / section double-booking. Conflict handling for a
--      teacher-less row is now split by check:
--
--        room    -> STILL ENFORCED. A room is physically occupied for a given
--                   day and time span whether or not a teacher has been named,
--                   so a Temporary schedule both takes a room claim and is
--                   blocked by one. Enforced in both directions.
--        teacher -> skipped. Nobody to clash with. (This one was already a
--                   no-op, since teacher_id = NULL never matches.)
--        section -> skipped, and existing Temporary rows are ignored by the
--                   section scan. The section's timetable is not settled until
--                   teachers are assigned, so provisional rows are allowed to
--                   overlap there; the "Temporary" badge surfaces them for
--                   cleanup.
--
--   3. The FK teacher_id -> sms_users was declared ON DELETE CASCADE. That was
--      defensible while a schedule could not exist without a teacher. Now that
--      teacher-less schedules are legal, deleting a user must NOT destroy the
--      timetable slot -- it should fall back to Temporary. Changed to SET NULL.
--
-- Per the lesson recorded in 116, the FK is rediscovered from pg_constraint
-- rather than addressed by name: 004 declared it inside a
-- CREATE TABLE IF NOT EXISTS, so the live delete rule may never have matched
-- what the migration file says. The block below is idempotent and repairs
-- whatever is actually there.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. Allow NULL teacher
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_subject_schedules
  ALTER COLUMN teacher_id DROP NOT NULL;

COMMENT ON COLUMN procurements.sms_subject_schedules.teacher_id IS
  'Assigned teacher. NULL = "Temporary" schedule with no teacher yet; such rows bypass conflict detection entirely.';

-- ----------------------------------------------------------------------------
-- 2. Narrow conflict detection for teacher-less schedules to the room check
-- ----------------------------------------------------------------------------
-- The trigger itself is unchanged from 004 and always runs; which checks apply
-- to a Temporary row is decided inside check_schedule_conflicts below.
CREATE OR REPLACE FUNCTION public.check_schedule_conflicts_trigger()
RETURNS TRIGGER AS $$
DECLARE
  conflict_record RECORD;
  conflict_messages TEXT[] := ARRAY[]::TEXT[];
BEGIN
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

-- Room clashes apply to Temporary rows in both directions; teacher and section
-- clashes ignore them on both sides.
CREATE OR REPLACE FUNCTION public.check_schedule_conflicts(
  p_room_id BIGINT,
  p_teacher_id BIGINT,
  p_section_id BIGINT,
  p_days_of_week INTEGER[],
  p_start_time TIME,
  p_end_time TIME,
  p_school_year TEXT,
  p_id BIGINT DEFAULT NULL -- For updates, exclude current record
) RETURNS TABLE(
  conflict_type TEXT,
  conflict_message TEXT
) AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  -- Check room conflicts. Applies to Temporary rows too: a room is occupied
  -- for that day and time span whether or not a teacher has been named.
  SELECT COUNT(*) INTO conflict_count
  FROM procurements.sms_subject_schedules
  WHERE room_id = p_room_id
    AND school_year = p_school_year
    AND (p_id IS NULL OR id != p_id)
    AND public.days_overlap(days_of_week, p_days_of_week)
    AND public.times_overlap(start_time, end_time, p_start_time, p_end_time);

  IF conflict_count > 0 THEN
    RETURN QUERY SELECT
      'room'::TEXT,
      'Room is already scheduled at this time on one or more selected days'::TEXT;
  END IF;

  -- Teacher and section checks do not apply to a Temporary schedule
  IF p_teacher_id IS NULL THEN
    RETURN;
  END IF;

  -- Check teacher conflicts
  SELECT COUNT(*) INTO conflict_count
  FROM procurements.sms_subject_schedules
  WHERE teacher_id = p_teacher_id
    AND school_year = p_school_year
    AND (p_id IS NULL OR id != p_id)
    AND public.days_overlap(days_of_week, p_days_of_week)
    AND public.times_overlap(start_time, end_time, p_start_time, p_end_time);

  IF conflict_count > 0 THEN
    RETURN QUERY SELECT
      'teacher'::TEXT,
      'Teacher is already scheduled at this time on one or more selected days'::TEXT;
  END IF;

  -- Check section conflicts. Existing Temporary rows are ignored here: the
  -- section timetable is not settled until their teachers are assigned.
  SELECT COUNT(*) INTO conflict_count
  FROM procurements.sms_subject_schedules
  WHERE section_id = p_section_id
    AND school_year = p_school_year
    AND (p_id IS NULL OR id != p_id)
    AND teacher_id IS NOT NULL
    AND public.days_overlap(days_of_week, p_days_of_week)
    AND public.times_overlap(start_time, end_time, p_start_time, p_end_time);

  IF conflict_count > 0 THEN
    RETURN QUERY SELECT
      'section'::TEXT,
      'Section is already scheduled at this time on one or more selected days'::TEXT;
  END IF;

  -- No conflicts found
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. teacher_id FK: ON DELETE CASCADE -> SET NULL
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT c.conname  AS constraint_name,
           c.confdeltype AS delete_code,
           tn.nspname AS table_schema,
           t.relname  AS table_name,
           a.attname  AS column_name
    FROM pg_constraint c
    JOIN pg_class     t  ON t.oid  = c.conrelid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN pg_class     r  ON r.oid  = c.confrelid
    JOIN pg_namespace rn ON rn.oid = r.relnamespace
    JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND tn.nspname = 'procurements'
      AND t.relname  = 'sms_subject_schedules'
      AND a.attname  = 'teacher_id'
      AND rn.nspname = 'procurements'
      AND r.relname  = 'sms_users'
      AND array_length(c.conkey, 1) = 1
  LOOP
    IF fk.delete_code = 'n' THEN
      RAISE NOTICE 'ok: % already ON DELETE SET NULL', fk.constraint_name;
      CONTINUE;
    END IF;

    RAISE NOTICE 'repairing: % confdeltype % -> ON DELETE SET NULL',
      fk.constraint_name, fk.delete_code;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      fk.table_schema, fk.table_name, fk.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
      'REFERENCES procurements.sms_users(id) ON DELETE SET NULL',
      fk.table_schema, fk.table_name, fk.constraint_name, fk.column_name
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Verification
-- ----------------------------------------------------------------------------
-- teacher_id should read is_nullable = YES
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'procurements'
  AND table_name   = 'sms_subject_schedules'
  AND column_name  = 'teacher_id';

-- teacher_id FK should read SET NULL
SELECT c.conname AS constraint_name,
       CASE c.confdeltype
         WHEN 'c' THEN 'CASCADE'
         WHEN 'n' THEN 'SET NULL'
         WHEN 'a' THEN 'NO ACTION'
         WHEN 'r' THEN 'RESTRICT'
         WHEN 'd' THEN 'SET DEFAULT'
       END AS on_delete
FROM pg_constraint c
JOIN pg_class     t  ON t.oid  = c.conrelid
JOIN pg_namespace tn ON tn.oid = t.relnamespace
JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND tn.nspname = 'procurements'
  AND t.relname  = 'sms_subject_schedules'
  AND a.attname  = 'teacher_id';
