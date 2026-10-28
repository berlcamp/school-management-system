-- ============================================================================
-- 222 — Subject schedules by term
-- ============================================================================
-- A subject in a section can change hands mid-year: Teacher A handles Science
-- 5-Rizal in Terms 1-2 and Teacher B takes it in Term 3. `sms_subject_schedules`
-- had no notion of a term — one row is one time block for the whole school
-- year — so the only workaround was to schedule both teachers for the whole
-- year (6 subject/section pairs on the local clone already carry two). That
-- made both of them "the teacher" everywhere: both could encode every term,
-- both appeared in Grade Monitoring for every term, and both carried the load
-- all year.
--
-- 1. `grading_periods SMALLINT[]` — the grading periods a time block applies
--    to. **NULL = the whole school year, and nothing is backfilled**, so every
--    existing row keeps meaning exactly what it meant and nothing moves on
--    apply. Values are grading periods, not "terms", so one column serves
--    terms (1-3), quarters (1-4) and old-curriculum SHS's four semestral
--    quarters (189). The CHECK admits NULL or a non-empty subset of 1-4; it
--    cannot know whether a year has three periods or four, so the app offers
--    only the section's periods (a stray 4 on a term year simply never
--    matches). The app normalises: all periods ticked → NULL.
--
-- Two rules, written once per language — the TS twin is
-- `lib/utils/scheduleTerms.ts` (`scheduleCoversPeriod`, `scheduleTermsOverlap`):
--   covers(row, p) = grading_periods IS NULL OR p = ANY (grading_periods)
--   overlap(a, b)  = either is NULL, or the arrays share an element (&&)
-- Inline here rather than a helper function: two one-liners do not earn a
-- dependency.
--
-- 2. `check_schedule_conflicts` gains `p_grading_periods` and applies
--    overlap() to its room, teacher and section scans, so A (T1-T2) and B (T3)
--    in the same room and slot no longer clash, while A (whole year) and B
--    (T3) still do. 138's SECURITY DEFINER + pinned search_path is kept, and
--    so is 124's `conflict_override` early return in the trigger function.
--    ⚠ **The 8-argument version is DROPPED and re-created with 9**: adding a
--    parameter with CREATE OR REPLACE would leave the old overload beside it,
--    and an 8-argument positional call would then be ambiguous. Safe because
--    the only caller is `check_schedule_conflicts_trigger()`, replaced in the
--    same file to pass `NEW.grading_periods` — the client never calls the
--    function (the Add Schedule modal's pre-save warning is
--    `lib/utils/scheduleConflicts.ts`), and no view or policy references it.
--
-- 3. `unpost_class_record_grades` (192, as replaced by 200): the scheduled-teacher branch of the
--    guard now asks covers(row, rec.grading_period) — a class record is per
--    grading period, so B may unpost Term 3 and not Term 1. The record's own
--    teacher, the section adviser and super admin are unchanged.
--
-- 4. `get_grade_encoding_status` (107/179/191): `assigned_teachers` is now
--    computed **per period** from the rows that cover it, so Grade Monitoring
--    names B for Term 3 only. Same signature and RETURNS TABLE: CREATE OR
--    REPLACE. The `sched` CTE is reduced to the (subject, section) pairs —
--    the denominators and `encoded` are untouched.
--
-- Function bodies were taken from the migration files named below because no
-- local clone was available when this was rebuilt; before applying, compare
-- each against `pg_get_functiondef` on the local clone (116/157 drift).
--   check_schedule_conflicts          138_cross_school_teacher_conflict.sql
--   check_schedule_conflicts_trigger  124_schedule_conflict_override.sql
--   unpost_class_record_grades        200_transfer_in_carried_grades.sql
--                                     (keeps carried-over grades; only the
--                                     grading_periods line is new)
--   get_grade_encoding_status         191_grade_encoding_periods_per_section.sql
--
-- Grades RLS is app-layer (invariant 2) and stays so: no policy changes.
-- `post_class_record_grades` has no schedule check and is not touched.
--
-- Pre-apply (read-only): nothing but the trigger function may call the 8-arg version.
--   SELECT p.oid::regprocedure FROM pg_proc p
--    WHERE p.prosrc ILIKE '%check_schedule_conflicts(%' AND p.proname <> 'check_schedule_conflicts';
--   -- expect exactly: check_schedule_conflicts_trigger()
-- and nothing (view, policy, default, other function) may depend on it:
--   SELECT d.classid::regclass AS catalog, d.objid, d.deptype,
--          pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent
--     FROM pg_depend d
--    WHERE d.refclassid = 'pg_proc'::regclass
--      AND d.refobjid = 'public.check_schedule_conflicts(bigint, bigint, bigint, integer[], time without time zone, time without time zone, text, bigint)'::regprocedure
--      AND d.deptype <> 'i';
--   -- expect no rows (a plpgsql caller such as the trigger function is not
--   -- tracked in pg_depend, which is why the prosrc check above is kept)
-- Rows touched: 0 (DDL only).
-- ============================================================================

-- 1. Column
ALTER TABLE procurements.sms_subject_schedules
  ADD COLUMN IF NOT EXISTS grading_periods SMALLINT[];

ALTER TABLE procurements.sms_subject_schedules
  DROP CONSTRAINT IF EXISTS sms_subject_schedules_grading_periods_check;
ALTER TABLE procurements.sms_subject_schedules
  ADD CONSTRAINT sms_subject_schedules_grading_periods_check
  CHECK (grading_periods IS NULL
         OR (cardinality(grading_periods) > 0
             AND grading_periods <@ ARRAY[1,2,3,4]::SMALLINT[]));

COMMENT ON COLUMN procurements.sms_subject_schedules.grading_periods IS
  'Grading periods this time block applies to; NULL = the whole school year (migration 222).';

-- 2. Conflict check, term-aware. Rebuilt from migration 138's file.
-- OR REPLACE only so a re-apply is a no-op; the DROP above is what removes the
-- 8-argument overload.
DROP FUNCTION IF EXISTS public.check_schedule_conflicts(bigint, bigint, bigint, integer[], time without time zone, time without time zone, text, bigint);

CREATE OR REPLACE FUNCTION public.check_schedule_conflicts(p_room_id bigint, p_teacher_id bigint, p_section_id bigint, p_days_of_week integer[], p_start_time time without time zone, p_end_time time without time zone, p_school_year text, p_id bigint DEFAULT NULL::bigint, p_grading_periods smallint[] DEFAULT NULL::smallint[])
 RETURNS TABLE(conflict_type text, conflict_message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'procurements', 'public'
AS $function$
DECLARE
  conflict_count INTEGER;
  v_school_id BIGINT;
  v_other_schools TEXT;
  v_same_school INTEGER;
BEGIN
  -- Check room conflicts. Applies to Temporary rows too: a room is occupied
  -- for that day and time span whether or not a teacher has been named.
  -- Rows in disjoint grading periods never meet (222).
  SELECT COUNT(*) INTO conflict_count
  FROM procurements.sms_subject_schedules
  WHERE room_id = p_room_id
    AND school_year = p_school_year
    AND (p_id IS NULL OR id != p_id)
    AND public.days_overlap(days_of_week, p_days_of_week)
    AND (grading_periods IS NULL OR p_grading_periods IS NULL OR grading_periods && p_grading_periods)
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

  -- The school this slot belongs to, read from its section. The row's own
  -- school_id is not a parameter of this function and the signature is kept
  -- as it is, since the trigger and the client both call it positionally.
  SELECT school_id INTO v_school_id
  FROM procurements.sms_sections
  WHERE id = p_section_id;

  -- Check teacher conflicts, split by where the clashing slot sits.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE s.school_id IS NOT DISTINCT FROM v_school_id),
    string_agg(DISTINCT sc.name, ', ')
      FILTER (WHERE s.school_id IS DISTINCT FROM v_school_id)
  INTO conflict_count, v_same_school, v_other_schools
  FROM procurements.sms_subject_schedules s
  LEFT JOIN procurements.sms_schools sc ON sc.id = s.school_id
  WHERE s.teacher_id = p_teacher_id
    AND s.school_year = p_school_year
    AND (p_id IS NULL OR s.id != p_id)
    AND public.days_overlap(s.days_of_week, p_days_of_week)
    AND (s.grading_periods IS NULL OR p_grading_periods IS NULL OR s.grading_periods && p_grading_periods)
    AND public.times_overlap(s.start_time, s.end_time, p_start_time, p_end_time);

  IF v_same_school > 0 THEN
    RETURN QUERY SELECT
      'teacher'::TEXT,
      'Teacher is already scheduled at this time on one or more selected days'::TEXT;
  END IF;

  -- Named, because the encoder cannot see the row they are being refused over
  IF conflict_count > v_same_school THEN
    RETURN QUERY SELECT
      'teacher'::TEXT,
      format(
        'Teacher is already scheduled at this time at another school (%s) on one or more selected days. They are assigned to more than one school -- confirm with that school before saving anyway',
        COALESCE(v_other_schools, 'unnamed school')
      )::TEXT;
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
    AND (grading_periods IS NULL OR p_grading_periods IS NULL OR grading_periods && p_grading_periods)
    AND public.times_overlap(start_time, end_time, p_start_time, p_end_time);

  IF conflict_count > 0 THEN
    RETURN QUERY SELECT
      'section'::TEXT,
      'Section is already scheduled at this time on one or more selected days'::TEXT;
  END IF;

  -- No conflicts found
  RETURN;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_schedule_conflicts(bigint, bigint, bigint, integer[], time, time, text, bigint, smallint[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_schedule_conflicts(
  BIGINT, BIGINT, BIGINT, INTEGER[], TIME, TIME, TEXT, BIGINT, SMALLINT[]
) IS
  'Reports room / teacher / section clashes for a candidate slot. SECURITY DEFINER since 138: a teacher can hold posts at several schools (134), and under the caller''s own RLS the teacher check saw only the caller''s school -- so the same slot was rejected for division staff and accepted for school staff. Room and section cannot cross schools. Enforcement lives in check_schedule_conflicts_trigger, which 124 exempts for conflict_override rows. 222 added p_grading_periods: rows in disjoint grading periods never clash.';

-- 3. Trigger function: passes the row's terms as the 9th argument.
CREATE OR REPLACE FUNCTION public.check_schedule_conflicts_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
      NEW.id,
      NEW.grading_periods
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
$function$;

-- 4. Unpost guard (built on 200's body, which keeps carried-over grades): a scheduled teacher may unpost only a period their row covers.
CREATE OR REPLACE FUNCTION procurements.unpost_class_record_grades(p_class_record_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'procurements', 'public'
AS $function$
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
            AND (ss.grading_periods IS NULL
                 OR rec.grading_period = ANY (ss.grading_periods))
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
     AND g.school_year    = rec.school_year
     -- 200: a carried-over grade was never this record's to take back.
     AND g.carried_from_school IS NULL;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  UPDATE procurements.sms_class_records
     SET is_posted = false, unposted_at = NOW(), updated_at = NOW()
   WHERE id = rec.id;

  RETURN v_removed;
END;
$function$;

REVOKE ALL ON FUNCTION procurements.unpost_class_record_grades(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.unpost_class_record_grades(BIGINT) TO authenticated;

-- 5. Grade Monitoring: assigned teachers per period.
CREATE OR REPLACE FUNCTION procurements.get_grade_encoding_status(p_school_id bigint, p_school_year text, p_periods integer DEFAULT 4)
 RETURNS TABLE(subject_id bigint, subject_name text, is_madrasah boolean, section_id bigint, section_name text, grade_level integer, assigned_teachers text[], grading_period integer, expected_learners integer, encoded_learners integer, encoders text[], last_encoded_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'procurements', 'public'
AS $function$
  WITH sched AS (
    SELECT DISTINCT ss.subject_id, ss.section_id
    FROM procurements.sms_subject_schedules ss
    WHERE ss.school_id = p_school_id
      AND ss.school_year = p_school_year
  ),
  enrolled AS (
    -- Denominator for a subject the whole section takes.
    SELECT e.section_id, COUNT(DISTINCT e.student_id) AS n
    FROM procurements.sms_enrollments e
    WHERE e.school_year = p_school_year
      AND e.status = 'approved'
      AND e.enrollment_status IN
          ('active', 'promoted', 'graduated', 'retained', 'completed')
    GROUP BY e.section_id
  ),
  rostered AS (
    -- Denominator for a subject with selective_enrolment: only the learners
    -- actually rostered, mirroring TeacherGradeEntryTable's own split. Was
    -- keyed to is_madrasah until 179 split the roster half off.
    SELECT sub.subject_id, sub.section_id, COUNT(DISTINCT sub.student_id) AS n
    FROM procurements.sms_student_subjects sub
    WHERE sub.school_year = p_school_year
      AND sub.school_id = p_school_id
    GROUP BY sub.subject_id, sub.section_id
  ),
  encoded AS (
    -- `grade > 0` is what counts as encoded, not row existence: the quarter
    -- entry screen writes a 0-filled row for every learner and period on save,
    -- so COUNT(*) would report an untouched section as fully encoded. Valid
    -- DepEd grades never reach 0 (the entry input floors at 60).
    SELECT
      g.subject_id,
      g.section_id,
      g.grading_period,
      COUNT(DISTINCT g.student_id) AS n,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.name), NULL) AS encoders,
      MAX(g.updated_at) AS last_encoded_at
    FROM procurements.sms_grades g
    JOIN sched s
      ON s.subject_id = g.subject_id
     AND s.section_id = g.section_id
    LEFT JOIN procurements.sms_users u ON u.id = g.teacher_id
    WHERE g.school_year = p_school_year
      AND g.grade > 0
    GROUP BY g.subject_id, g.section_id, g.grading_period
  )
  SELECT
    s.subject_id,
    subj.name AS subject_name,
    subj.is_madrasah,
    s.section_id,
    sec.name AS section_name,
    sec.grade_level::INTEGER,
    t.assigned_teachers,
    p.period AS grading_period,
    COALESCE(
      CASE WHEN subj.selective_enrolment THEN r.n ELSE en.n END, 0
    )::INTEGER AS expected_learners,
    COALESCE(e.n, 0)::INTEGER AS encoded_learners,
    COALESCE(e.encoders, ARRAY[]::TEXT[]) AS encoders,
    e.last_encoded_at
  FROM sched s
  JOIN procurements.sms_subjects subj ON subj.id = s.subject_id
  JOIN procurements.sms_sections sec  ON sec.id = s.section_id
  -- The periods this SECTION has, not the school's (migration 189).
  CROSS JOIN LATERAL generate_series(
    1,
    CASE
      WHEN sec.shs_curriculum = 'old' THEN 4
      ELSE GREATEST(COALESCE(p_periods, 4), 1)
    END
  ) AS p(period)
  -- The teachers whose rows cover THIS period (222): a subject that passes
  -- from Teacher A (T1-T2) to Teacher B (T3) names B for T3 only.
  CROSS JOIN LATERAL (
    SELECT COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.name), NULL), ARRAY[]::TEXT[])
             AS assigned_teachers
    FROM procurements.sms_subject_schedules ss
    LEFT JOIN procurements.sms_users u ON u.id = ss.teacher_id
    WHERE ss.school_id = p_school_id
      AND ss.school_year = p_school_year
      AND ss.subject_id = s.subject_id
      AND ss.section_id = s.section_id
      AND (ss.grading_periods IS NULL OR p.period = ANY (ss.grading_periods))
  ) t
  LEFT JOIN enrolled en ON en.section_id = s.section_id
  LEFT JOIN rostered r
    ON r.subject_id = s.subject_id AND r.section_id = s.section_id
  LEFT JOIN encoded e
    ON e.subject_id = s.subject_id
   AND e.section_id = s.section_id
   AND e.grading_period = p.period
  WHERE subj.school_id = p_school_id
  ORDER BY sec.grade_level, sec.name, subj.name, p.period;
$function$;
