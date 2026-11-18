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
-- One new table (empty), two triggers, one helper, one RPC. The schedule
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
