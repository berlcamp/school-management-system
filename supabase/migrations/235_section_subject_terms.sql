-- ============================================================================
-- Migration 235: Senior High subjects offered in some terms of a section
-- ============================================================================
--
-- APPLY AFTER 189 (sms_sections.shs_curriculum) and 223 (schedule
-- grading_periods). 216 (designations) and 200 (carried grades) are used when
-- present and not required.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
--
-- Under the term-based Senior High curriculum (Grades 11-12, SY 2026-2027
-- onward) a section carries full-year subjects beside single-term ones — an
-- elective in Term 1 only, another in Term 2 only — and for those, that term's
-- grade IS the final grade. 173 made the card wait for all three terms, so a
-- single-term subject never had a final and dropped out of the general average.
--
-- The term belongs to the subject IN A SECTION (the same subject can be Term 1
-- in STEM-A and Term 2 in STEM-B), so it is stored per (section, subject,
-- school year) — never on sms_subjects, and never derived from 223's schedule
-- `grading_periods`, which record teacher hand-overs: a Term 3 teacher not yet
-- assigned must not read as "offered in Terms 1-2" and print a final early.
--
-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------
--
-- * NO ROW = OFFERED THE WHOLE YEAR. {1,2,3} is never stored — the save
--   function deletes the row — so "whole year" has one representation.
-- * Only Grade 11-12 sections not on the old (semestral) curriculum, in
--   term-based school years. There is no SQL helper for "term-based year":
--   177 and 189 compare `school_year >= '2026-2027'` literally and so does this
--   file. TS twin: TERM_SYSTEM_START_SY in lib/utils/schoolYear.ts.
-- * While an offering exists, every schedule row of that (section, subject,
--   school year) has non-NULL grading_periods inside it (trigger on
--   sms_subject_schedules).
-- * A term holding a grade (> 0, carried transfer-in grades included) can't be
--   dropped from an offering.
-- * save_section_subject_terms narrows the schedule rows and writes the
--   offering together; a time block whose terms would become empty refuses the
--   whole save — no schedule row is ever deleted as a side effect.
-- * Writers: roster roles at the section's school, division_admin, super admin,
--   and (where 216 is applied) a Department Head for subjects they head. No
--   Grade Level Coordinator branch: 216 lets a GLC change a schedule's teacher
--   only, and an offering rewrites grading_periods.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- One new table (empty), two triggers, one helper, one RPC, and two functions
-- replaced with the same signatures (parts 6-7: GPA, Grade Monitoring). The schedule
-- trigger only acts where an offering row exists, so nothing changes until a
-- school sets one. No DML.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS sms_subject_schedules_offering_guard ON procurements.sms_subject_schedules;
--   DROP FUNCTION IF EXISTS procurements.save_section_subject_terms(BIGINT, BIGINT, SMALLINT[]);
--   DROP TABLE IF EXISTS procurements.sms_section_subject_terms;   -- drops its trigger
--   DROP FUNCTION IF EXISTS procurements.sms_subject_schedules_offering_guard();
--   DROP FUNCTION IF EXISTS procurements.sms_section_subject_terms_guard();
--   DROP FUNCTION IF EXISTS procurements.sms_may_set_subject_terms(BIGINT, BIGINT);
--   DROP TRIGGER IF EXISTS sms_sections_offering_lock ON procurements.sms_sections;
--   DROP FUNCTION IF EXISTS procurements.sms_sections_offering_lock();
--   (and re-run 234's students_gpa_for_grade and 223's get_grade_encoding_status)
--
-- Tests: supabase/tests/235_section_subject_terms.sql
-- ============================================================================

SET search_path TO procurements, public;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_section_subject_terms (
  id          BIGSERIAL PRIMARY KEY,
  section_id  BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  subject_id  BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE,
  school_year TEXT   NOT NULL,
  terms       SMALLINT[] NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  CONSTRAINT sms_section_subject_terms_unique UNIQUE (section_id, subject_id, school_year),
  CONSTRAINT sms_section_subject_terms_terms_check CHECK (
    cardinality(terms) BETWEEN 1 AND 2
    AND terms <@ ARRAY[1, 2, 3]::SMALLINT[]
  )
);

COMMENT ON TABLE procurements.sms_section_subject_terms IS
  'Senior High subject offered in some terms of a section only (235). No row = whole year. Written through save_section_subject_terms.';

CREATE INDEX IF NOT EXISTS sms_section_subject_terms_section_idx
  ON procurements.sms_section_subject_terms (section_id, school_year);

-- ---------------------------------------------------------------------------
-- 2. Who may set an offering
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_may_set_subject_terms(
  p_section_id BIGINT,
  p_subject_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_school BIGINT;
  v_heads  BOOLEAN := FALSE;
BEGIN
  SELECT school_id::BIGINT INTO v_school
  FROM procurements.sms_sections WHERE id = p_section_id;
  IF v_school IS NULL THEN
    RETURN FALSE;
  END IF;

  -- The roster branch of the schedule INSERT policy (115/216), verbatim.
  IF EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar',
                     'division_admin', 'super admin')
      AND (u.type IN ('division_admin', 'super admin') OR u.school_id = v_school)
  ) THEN
    RETURN TRUE;
  END IF;

  -- A Department Head for a subject they head (216), where 216 is applied.
  IF to_regprocedure('procurements.sms_heads_subject(bigint)') IS NOT NULL THEN
    EXECUTE 'SELECT procurements.sms_heads_subject($1)' INTO v_heads USING p_subject_id;
    IF v_heads AND EXISTS (
      SELECT 1 FROM procurements.sms_subjects s
      WHERE s.id = p_subject_id AND s.school_id = v_school
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION procurements.sms_may_set_subject_terms(BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sms_may_set_subject_terms(BIGINT, BIGINT) TO authenticated, service_role;

ALTER TABLE procurements.sms_section_subject_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Section subject terms are viewable by authenticated users" ON procurements.sms_section_subject_terms;
CREATE POLICY "Section subject terms are viewable by authenticated users"
  ON procurements.sms_section_subject_terms FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Section subject terms are insertable by schedule writers" ON procurements.sms_section_subject_terms;
CREATE POLICY "Section subject terms are insertable by schedule writers"
  ON procurements.sms_section_subject_terms FOR INSERT TO authenticated
  WITH CHECK (procurements.sms_may_set_subject_terms(section_id, subject_id));

DROP POLICY IF EXISTS "Section subject terms are updatable by schedule writers" ON procurements.sms_section_subject_terms;
CREATE POLICY "Section subject terms are updatable by schedule writers"
  ON procurements.sms_section_subject_terms FOR UPDATE TO authenticated
  USING (procurements.sms_may_set_subject_terms(section_id, subject_id))
  WITH CHECK (procurements.sms_may_set_subject_terms(section_id, subject_id));

DROP POLICY IF EXISTS "Section subject terms are deletable by schedule writers" ON procurements.sms_section_subject_terms;
CREATE POLICY "Section subject terms are deletable by schedule writers"
  ON procurements.sms_section_subject_terms FOR DELETE TO authenticated
  USING (procurements.sms_may_set_subject_terms(section_id, subject_id));

-- ---------------------------------------------------------------------------
-- 3. The offering guard: eligible section, schedules inside, no graded term dropped
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_section_subject_terms_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_sec     RECORD;
  v_period  INTEGER;
  v_terms   TEXT;
BEGIN
  SELECT grade_level::INTEGER AS grade_level, school_year::TEXT AS school_year,
         COALESCE(shs_curriculum, '')::TEXT AS curriculum
    INTO v_sec
  FROM procurements.sms_sections WHERE id = NEW.section_id;

  IF v_sec.grade_level IS NULL OR v_sec.grade_level NOT IN (11, 12)
     OR v_sec.curriculum = 'old' OR v_sec.school_year < '2026-2027' THEN
    RAISE EXCEPTION
      'A subject can be offered in some terms only in a Grade 11-12 section on the term-based curriculum (SY 2026-2027 onward).'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.school_year IS DISTINCT FROM v_sec.school_year THEN
    RAISE EXCEPTION 'The offering must be for the section''s own school year (%).', v_sec.school_year
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stored sorted and distinct.
  NEW.terms := ARRAY(SELECT DISTINCT t FROM unnest(NEW.terms) t ORDER BY t);
  NEW.updated_at := NOW();
  v_terms := (SELECT string_agg('Term ' || t, ', ' ORDER BY t) FROM unnest(NEW.terms) t);

  IF EXISTS (
    SELECT 1 FROM procurements.sms_subject_schedules ss
    WHERE ss.section_id = NEW.section_id
      AND ss.subject_id = NEW.subject_id
      AND ss.school_year = NEW.school_year
      AND (ss.grading_periods IS NULL OR NOT (ss.grading_periods::SMALLINT[] <@ NEW.terms))
  ) THEN
    RAISE EXCEPTION
      'A time block of this subject in this section runs outside %. Narrow it first (Offered in does this for you).', v_terms
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT g.grading_period::INTEGER INTO v_period
  FROM procurements.sms_grades g
  WHERE g.section_id = NEW.section_id
    AND g.subject_id = NEW.subject_id
    AND g.school_year = NEW.school_year
    AND g.grade > 0
    AND NOT (g.grading_period::SMALLINT = ANY (NEW.terms))
  ORDER BY g.grading_period
  LIMIT 1;
  IF v_period IS NOT NULL THEN
    RAISE EXCEPTION
      'Grades are already encoded for Term % of this subject in this section, so it must stay offered in Term %.',
      v_period, v_period
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_section_subject_terms_guard ON procurements.sms_section_subject_terms;
CREATE TRIGGER sms_section_subject_terms_guard
  BEFORE INSERT OR UPDATE ON procurements.sms_section_subject_terms
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_section_subject_terms_guard();

REVOKE ALL ON FUNCTION procurements.sms_section_subject_terms_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Schedules stay inside an offering
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_subject_schedules_offering_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_terms SMALLINT[];
BEGIN
  SELECT o.terms INTO v_terms
  FROM procurements.sms_section_subject_terms o
  WHERE o.section_id = NEW.section_id
    AND o.subject_id = NEW.subject_id
    AND o.school_year = NEW.school_year;

  IF v_terms IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.grading_periods IS NULL OR NOT (NEW.grading_periods::SMALLINT[] <@ v_terms) THEN
    RAISE EXCEPTION
      'This subject is offered in % only in this section, so its schedule must be limited to %.',
      (SELECT string_agg('Term ' || t, ', ' ORDER BY t) FROM unnest(v_terms) t),
      (SELECT string_agg('Term ' || t, ', ' ORDER BY t) FROM unnest(v_terms) t)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_subject_schedules_offering_guard ON procurements.sms_subject_schedules;
CREATE TRIGGER sms_subject_schedules_offering_guard
  BEFORE INSERT OR UPDATE OF grading_periods, subject_id, section_id, school_year
  ON procurements.sms_subject_schedules
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_subject_schedules_offering_guard();

REVOKE ALL ON FUNCTION procurements.sms_subject_schedules_offering_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Save an offering and narrow the schedules together
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: RLS on both tables still decides who may do this.
CREATE OR REPLACE FUNCTION procurements.save_section_subject_terms(
  p_section_id BIGINT,
  p_subject_id BIGINT,
  p_terms      SMALLINT[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = procurements, public
AS $$
DECLARE
  v_terms     SMALLINT[];
  v_sy        TEXT;
  v_row       RECORD;
  v_new       SMALLINT[];
  v_narrowed  INTEGER := 0;
  v_staff     BIGINT;
BEGIN
  IF p_terms IS NOT NULL THEN
    IF cardinality(p_terms) = 0 OR NOT (p_terms <@ ARRAY[1, 2, 3]::SMALLINT[]) THEN
      RAISE EXCEPTION 'Offered terms must be one or more of Term 1, Term 2 and Term 3.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_terms := ARRAY(SELECT DISTINCT t FROM unnest(p_terms) t ORDER BY t);
    IF v_terms = ARRAY[1, 2, 3]::SMALLINT[] THEN
      v_terms := NULL;  -- the whole year has one representation: no row
    END IF;
  END IF;

  SELECT school_year::TEXT INTO v_sy FROM procurements.sms_sections WHERE id = p_section_id;
  IF v_sy IS NULL THEN
    RAISE EXCEPTION 'Section % not found.', p_section_id USING ERRCODE = 'no_data_found';
  END IF;

  -- RLS refuses anyway; this says so in a sentence instead of a policy name.
  IF NOT procurements.is_service_role()
     AND NOT procurements.sms_may_set_subject_terms(p_section_id, p_subject_id) THEN
    RAISE EXCEPTION
      'Only the school head, assistant school head, admin, registrar or the subject''s Department Head can set which terms a subject is offered in.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_terms IS NULL THEN
    DELETE FROM procurements.sms_section_subject_terms
    WHERE section_id = p_section_id AND subject_id = p_subject_id AND school_year = v_sy;
    RETURN jsonb_build_object('terms', NULL, 'narrowed_schedules', 0);
  END IF;

  -- Lift a narrower existing offering first, so the schedule trigger does not
  -- judge the narrowed rows against an offering that is about to change; the
  -- guard on the new row below re-checks everything.
  DELETE FROM procurements.sms_section_subject_terms
  WHERE section_id = p_section_id AND subject_id = p_subject_id AND school_year = v_sy;

  FOR v_row IN
    SELECT id, grading_periods
    FROM procurements.sms_subject_schedules
    WHERE section_id = p_section_id AND subject_id = p_subject_id AND school_year = v_sy
    ORDER BY id
    FOR UPDATE
  LOOP
    v_new := ARRAY(
      SELECT t FROM unnest(COALESCE(v_row.grading_periods::SMALLINT[], ARRAY[1, 2, 3]::SMALLINT[])) t
      WHERE t = ANY (v_terms) ORDER BY t
    );
    IF cardinality(v_new) = 0 THEN
      RAISE EXCEPTION
        'A time block of this subject only covers %; remove it or change its terms first.',
        (SELECT string_agg('Term ' || t, ', ' ORDER BY t) FROM unnest(v_row.grading_periods::SMALLINT[]) t)
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_row.grading_periods IS NULL OR v_row.grading_periods::SMALLINT[] IS DISTINCT FROM v_new THEN
      UPDATE procurements.sms_subject_schedules SET grading_periods = v_new WHERE id = v_row.id;
      v_narrowed := v_narrowed + 1;
    END IF;
  END LOOP;

  IF NOT procurements.is_service_role() THEN
    v_staff := (procurements.current_staff()).id;
  END IF;

  INSERT INTO procurements.sms_section_subject_terms (section_id, subject_id, school_year, terms, updated_by)
  VALUES (p_section_id, p_subject_id, v_sy, v_terms, v_staff);

  RETURN jsonb_build_object('terms', to_jsonb(v_terms), 'narrowed_schedules', v_narrowed);
END;
$$;

REVOKE ALL ON FUNCTION procurements.save_section_subject_terms(BIGINT, BIGINT, SMALLINT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.save_section_subject_terms(BIGINT, BIGINT, SMALLINT[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Promotion GPA: a term-limited subject weighs as one subject (Grades 11-12)
-- ---------------------------------------------------------------------------
-- Body is 234's, verbatim for K-10 and for every Grade 11-12 section that has
-- no offering row. For a Grade 11-12 section WITH an offering, each subject
-- (MAPEH bucket kept, 153) is averaged over its periods FIRST, then the
-- subjects are averaged — so a Term 1 elective counts once, like a full-year subject, as the
-- card's general average counts it (lib/utils/mapeh.ts). Grades in a period
-- outside the subject's offering in the enrollment's section are ignored. It
-- does not wait for a subject to be complete: the GPA has always averaged what
-- is encoded. For an SHS learner whose subjects all carry the same number of
-- encoded periods the result equals 234's. Compared with the clone's live body
-- before writing (it matched 234).
--
-- Nobody's GPA moves on apply: the per-subject rule applies only to learners
-- whose section has an offering row, and none exists until a school sets one.
-- (An unconditional version moved 84 Grade 11-12 learners on the clone,
-- 2025-2026 included — the final review's finding, hence the gate.)
CREATE OR REPLACE FUNCTION procurements.students_gpa_for_grade(
  p_student_ids BIGINT[],
  p_grade_level INTEGER,
  p_school_year TEXT DEFAULT NULL,
  p_school_id   BIGINT DEFAULT NULL
)
RETURNS TABLE (student_id BIGINT, gpa NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT ids.sid, avg_row.value
  FROM unnest(COALESCE(p_student_ids, ARRAY[]::BIGINT[])) AS ids(sid)
  LEFT JOIN LATERAL (
    SELECT e.section_id, e.school_year, e.school_id
    FROM procurements.sms_enrollments e
    WHERE e.student_id = ids.sid
      AND e.grade_level = p_grade_level
      AND e.status = 'approved'
      AND (p_school_year IS NULL OR e.school_year = p_school_year)
      AND (p_school_id IS NULL OR e.school_id = p_school_id)
    ORDER BY e.school_year DESC, e.created_at DESC
    LIMIT 1
  ) src ON TRUE
  -- Only a section that actually uses offerings gets the per-subject rule, so
  -- no learner's GPA moves until their section sets one (anti-goal: no row =
  -- byte-identical).
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM procurements.sms_section_subject_terms o
      WHERE o.section_id = src.section_id AND o.school_year = src.school_year
    ) AS yes
  ) src_has_offering ON TRUE
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(collapsed.grade)::numeric, 2) AS value
    FROM (
      -- K-10 (234): one value per (period, bucket) across the year's sections.
      SELECT AVG(picked.grade) AS grade
      FROM (
        SELECT DISTINCT ON (g.subject_id, g.grading_period)
               g.subject_id, g.grading_period, g.grade, s.mapeh_component
        FROM procurements.sms_grades g
        JOIN procurements.sms_subjects s ON s.id = g.subject_id
        JOIN procurements.sms_sections sec ON sec.id = g.section_id
        WHERE (p_grade_level < 11 OR NOT src_has_offering.yes)
          AND g.student_id  = ids.sid
          AND g.school_year = src.school_year
          AND COALESCE(s.is_madrasah, false) = false
          AND g.grade > 0
          AND (
            g.section_id = src.section_id
            OR (
              p_grade_level < 11
              AND sec.school_id::BIGINT    = src.school_id
              AND sec.school_year::TEXT    = src.school_year
              AND sec.grade_level::INTEGER = p_grade_level
            )
          )
        ORDER BY g.subject_id, g.grading_period,
                 (g.section_id = src.section_id) DESC, g.section_id ASC
      ) picked
      GROUP BY
        picked.grading_period,
        CASE WHEN picked.mapeh_component IS NOT NULL
             THEN 'mapeh'
             ELSE 'subj:' || picked.subject_id::text END

      UNION ALL

      -- Grades 11-12 (235): one value per bucket, its periods averaged first.
      SELECT AVG(per_period.grade) AS grade
      FROM (
        SELECT AVG(g.grade) AS grade,
               CASE WHEN s.mapeh_component IS NOT NULL
                    THEN 'mapeh'
                    ELSE 'subj:' || s.id::text END AS bucket
        FROM procurements.sms_grades g
        JOIN procurements.sms_subjects s ON s.id = g.subject_id
        LEFT JOIN procurements.sms_section_subject_terms o
          ON o.section_id = src.section_id
         AND o.subject_id = g.subject_id
         AND o.school_year = src.school_year
        WHERE p_grade_level >= 11
          AND src_has_offering.yes
          AND g.student_id  = ids.sid
          AND g.section_id  = src.section_id
          AND g.school_year = src.school_year
          AND COALESCE(s.is_madrasah, false) = false
          AND g.grade > 0
          AND (o.terms IS NULL OR g.grading_period::SMALLINT = ANY (o.terms))
        GROUP BY g.grading_period,
                 CASE WHEN s.mapeh_component IS NOT NULL
                      THEN 'mapeh'
                      ELSE 'subj:' || s.id::text END
      ) per_period
      GROUP BY per_period.bucket
    ) collapsed
  ) avg_row ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION procurements.students_gpa_for_grade IS
  'Average grade per learner for a given grade level, excluding madrasah/ALS subjects and un-encoded (0) grades, with MAPEH components collapsed so the learning area counts once. K-10: one value per subject and period across the year''s same-grade sections (234). Grades 11-12: each subject averaged over its periods first, ignoring periods outside its section offering (235), then the subjects averaged. The single source of truth for section placement.';

GRANT EXECUTE ON FUNCTION procurements.students_gpa_for_grade(BIGINT[], INTEGER, TEXT, BIGINT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Grade Monitoring: a term-limited subject is expected in its terms only
-- ---------------------------------------------------------------------------
-- Taken from the clone's live definition (pg_get_functiondef, = 223's file),
-- plus the offering join and its predicate. Same signature: plain replace.
-- Compare with production before applying.
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
  -- 235: a subject offered in some terms of this section is expected in those
  -- terms only.
  LEFT JOIN procurements.sms_section_subject_terms o
    ON o.section_id = s.section_id
   AND o.subject_id = s.subject_id
   AND o.school_year = p_school_year
  WHERE subj.school_id = p_school_id
    AND (o.terms IS NULL OR p.period = ANY (o.terms))
  ORDER BY sec.grade_level, sec.name, subj.name, p.period;
$function$;

-- ---------------------------------------------------------------------------
-- 8. A section holding offerings keeps the facts that made it eligible
-- ---------------------------------------------------------------------------
-- The guard in part 3 runs when an offering is written; this covers the other
-- direction. Changing a section's grade level, curriculum or school year while
-- it holds offering rows would leave rows the app no longer shows (Offered in
-- is hidden for an ineligible section) but GPA, Grade Monitoring and the
-- schedule trigger still read — so it is refused until they are cleared.
CREATE OR REPLACE FUNCTION procurements.sms_sections_offering_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF (NEW.grade_level IS DISTINCT FROM OLD.grade_level
      OR NEW.shs_curriculum IS DISTINCT FROM OLD.shs_curriculum
      OR NEW.school_year IS DISTINCT FROM OLD.school_year)
     AND EXISTS (
       SELECT 1 FROM procurements.sms_section_subject_terms o
       WHERE o.section_id = OLD.id
     ) THEN
    RAISE EXCEPTION
      'This section has subjects set to be offered in some terms only. Set each back to the whole year (Manage Schedules → Offered in) before changing its grade level, curriculum or school year.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_sections_offering_lock ON procurements.sms_sections;
CREATE TRIGGER sms_sections_offering_lock
  BEFORE UPDATE OF grade_level, shs_curriculum, school_year ON procurements.sms_sections
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_sections_offering_lock();

REVOKE ALL ON FUNCTION procurements.sms_sections_offering_lock() FROM PUBLIC, anon, authenticated;
