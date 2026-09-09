-- ============================================================================
-- SPECIAL PROGRAMS, SPECIALISATIONS, AND GENERIC SELECTIVE ENROLMENT
-- ============================================================================
-- Since 034, `sms_subjects.is_madrasah` has meant TWO things at once, and 133
-- wrote that down explicitly when it made `program` the source of truth:
--
--   1. SELECTIVE ENROLMENT -- only the learners listed in sms_student_subjects
--      take the subject, instead of every learner holding a section slot;
--   2. EXCLUSION FROM THE GENERAL AVERAGE (076, 128, SF9/SF10/Form 137/card).
--
-- Madrasah wants both. ALS wants both. That is why one flag carried both for
-- eleven migrations without anybody noticing the conflation.
--
-- A Special Program in the Arts subject wants the FIRST AND EMPHATICALLY NOT
-- THE SECOND: an SPA learner's Music grade is a real graded subject that
-- belongs on their card and in their general average. So does EPP/TLE, where
-- a school splitting a section between Agri-Fishery and Industrial Arts needs
-- a per-learner roster on a subject that 174 already folds into a computed
-- parent that DOES count.
--
-- Tagging either of those `is_madrasah` to get the roster would silently drop
-- the learning area out of every general average, every GPA (128's
-- students_gpa_for_grade, which actually places and promotes), every SF9 and
-- every report card. That is a data-correctness bug, not a UI one.
--
-- SO THE FLAG IS SPLIT. `selective_enrolment` is the roster half and nothing
-- else. `is_madrasah` keeps the average half and keeps its name, because
-- renaming it would re-point ~14 call sites including signed, already-printed
-- forms -- the same argument 133 made for keeping it in the first place.
--
--   is_madrasah        = "out of the general average"   (Madrasah / ALS)
--   selective_enrolment = "this subject has a roster"    (anything at all)
--
-- THE ONLY IMPLICATION IS ONE-DIRECTIONAL, and it is enforced by a trigger:
--
--   is_madrasah = true  =>  selective_enrolment = true
--   selective_enrolment = true  =/=>  is_madrasah = true
--
-- That asymmetry IS the feature. Every one of these is legal:
--
--   regular + non-selective        regular + selective
--   TLE component + non-selective  TLE component + selective
--   special program + non-selective  special program + selective
--   madrasah/ALS + selective       (the only combination forced by a trigger)
--
-- There is deliberately NO constraint linking selective_enrolment to
-- special_program_id, to tle_component, to mapeh_component or to program.
-- A TLE subject gets a roster by ticking one generic checkbox; there is no
-- TLE-specific, SPA-specific or Madrasah-specific selective code anywhere.
--
-- ----------------------------------------------------------------------------
-- SPECIAL PROGRAMS ARE A SECOND AXIS, NOT A FOURTH `program` VALUE
-- ----------------------------------------------------------------------------
-- `sms_subjects.program` (133) is the CURRICULUM STREAM -- regular | madrasah
-- | als -- and it is CHECK-constrained precisely because each value carries
-- application behaviour: it drives is_madrasah through
-- sync_subject_program_trigger, and 136 pairs `als` subjects to `als` sections
-- through a trigger on sms_subject_schedules. Widening that CHECK with 'spa'
-- would drag both of those into a decision that has nothing to do with either.
--
-- It is also not extensible in the way this feature needs: a school invents
-- "Special Program in Journalism" on a Tuesday, and a CHECK constraint cannot
-- be widened by a school head.
--
-- So special programs are their own tables and their own nullable FKs on
-- sms_subjects, ORTHOGONAL to `program`. An SPA Music subject is:
--
--   program             = 'regular'      -- not MEP, not ALS
--   special_program_id  = SPA
--   specialization_id   = Music
--   selective_enrolment = true | false   -- independent of all of the above
--
-- `program = 'regular'` there means "not Madrasah, not ALS". It does not mean
-- "not special". The UI labels them "Curriculum Program" and "Special Program"
-- so a registrar is never shown two dropdowns both called Program.
--
-- ----------------------------------------------------------------------------
-- MEMBERSHIP IS NOT A ROSTER
-- ----------------------------------------------------------------------------
-- Two different relationships, deliberately kept apart:
--
--   MEMBERSHIP  sms_student_special_programs  -- "Juan is an SPA-Music learner
--                                                this school year"
--   ROSTER      sms_student_subjects (034)    -- "Juan takes SPA Music 7 in
--                                                section 7-Rizal"
--
-- Membership does NOT create roster rows, and a roster row does not imply
-- membership. The one connection is a ONE-WAY, ON-DEMAND PREFILL: opening the
-- roster modal for a subject tagged to a program pre-ticks that program's
-- members, leaves every tick editable, and writes nothing until Save (the 132
-- answer-key rule -- prefill is a convenience, never the mechanism).
-- sms_student_subjects therefore gains no column, no FK and no provenance
-- marker; the two tables never learn about each other.
--
-- ONE SPECIALISATION PER PROGRAM PER LEARNER PER YEAR, and specialization_id
-- is NULLABLE. Not every program has a second level -- STE and SPJ have none,
-- SPA has six areas, SPFL has a language per learner. A learner who genuinely
-- takes two strands of one program (two sports) is expressed where it belongs:
-- on both subjects' rosters. Forcing membership to carry that multiplicity
-- would re-fuse the two concepts this migration exists to separate. If the
-- division later confirms multi-strand membership is real, a child table is
-- additive and leaves every row here valid.
--
-- ----------------------------------------------------------------------------
-- SCOPE, PER THE 106/118/125 CONVENTION
-- ----------------------------------------------------------------------------
-- `sms_special_programs.school_id` NULL = division-wide master row, usable by
-- every school; set = that school's own program. SPA/SPS/SPFL are national
-- DepEd programs with national names, and fifteen schools each typing
-- "Special Program in the Arts" their own way makes a division roll-up
-- impossible.
--
-- A school-level role cannot create or edit a division row, and that is
-- enforced BY THE RLS POLICY, not by a trigger and not by the UI -- 125 solved
-- exactly this problem, and its school branch requires `school_id IS NOT NULL`
-- so a NULL row can never match. Copied verbatim, including the fully
-- qualified table name on both sides of every comparison: 115's bug was an
-- unqualified `u.school_id = school_id` binding to the inner table, always
-- true and silently type-valid.
--
-- NOTHING IS SEEDED. The master tables ship empty; the national list is not in
-- this repository and an unverified one would be worse than none.
--
-- ----------------------------------------------------------------------------
-- WHAT MOVES ON APPLY: NOTHING
-- ----------------------------------------------------------------------------
-- The only DML in this file is `selective_enrolment = COALESCE(is_madrasah,
-- false)` -- an EXACT copy. No is_madrasah value changes, no program value
-- changes, no grade, GPA, card, form or roster moves. Every subject behaves
-- byte-identically until somebody ticks a box. Reverting one subject is
-- `SET selective_enrolment = false`, not a migration.
--
-- That backfill is the entire safety argument: if it lands as anything other
-- than a verbatim copy, every Madrasah roster in the division opens up to
-- whole sections.
--
-- ----------------------------------------------------------------------------
-- KNOWN, DELIBERATELY UNTOUCHED
-- ----------------------------------------------------------------------------
-- sms_student_subjects (034) has RLS DISABLED, NO policies, and grants
-- INSERT/SELECT/UPDATE/DELETE/TRUNCATE to `anon`. Verified on the live schema,
-- not merely in the migration files. That is a real security hole and it
-- predates this work by 145 migrations. It is NOT fixed here: adding RLS to a
-- table that six live readers write to is a behaviour change that deserves its
-- own migration, its own row counts and its own rollback story, and bundling
-- it with an additive feature is how a Saturday outage happens. Tracked as a
-- dedicated follow-up migration, to take the next free number when it is
-- written. Do not let this note be the last mention of it.
--
-- ----------------------------------------------------------------------------
-- READ-ONLY, BEFORE APPLYING (expect 31 of 3576 on the current clone)
-- ----------------------------------------------------------------------------
--   SELECT count(*) AS subjects,
--          count(*) FILTER (WHERE is_madrasah) AS will_be_selective
--     FROM procurements.sms_subjects;
--
-- AFTER APPLYING, this must return 0 -- the backfill is exact or it is wrong:
--   SELECT count(*) FROM procurements.sms_subjects
--    WHERE selective_enrolment IS DISTINCT FROM COALESCE(is_madrasah, false);
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- 1. SPECIAL PROGRAMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_special_programs (
  id                    BIGSERIAL PRIMARY KEY,
  -- NULL = division-wide master row, per 106/118/125.
  school_id             BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  -- Per-program terminology, because the second level is not the same idea in
  -- every program: "Area of Specialization" (SPA), "Sport" (SPS), "Language"
  -- (SPFL). One column instead of per-program code; a program with no second
  -- level simply has no specialisation rows and the picker hides itself.
  specialization_label  TEXT NOT NULL DEFAULT 'Specialization',
  description           TEXT,
  -- Retire, never delete: a strand a school ran for three years is history a
  -- card was printed against (the 116 lesson -- the delete rule is what bites).
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TWO PARTIAL UNIQUE INDEXES, not one UNIQUE: Postgres treats NULLs as
-- distinct, so a single UNIQUE(school_id, code) would let the division insert
-- SPA twice while still blocking nothing useful. The 121/163 precedent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_special_programs_school_code_uniq
  ON procurements.sms_special_programs (school_id, upper(code))
  WHERE school_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_special_programs_division_code_uniq
  ON procurements.sms_special_programs (upper(code))
  WHERE school_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sms_special_programs_scope
  ON procurements.sms_special_programs (school_id, is_active);

COMMENT ON TABLE procurements.sms_special_programs IS
  'DepEd special curricular programs (SPA, SPS, SPFL, STE, ...). school_id NULL = division-wide master row usable by every school (106/118/125 convention); set = that school''s own program. Orthogonal to sms_subjects.program, which is the curriculum stream.';

COMMENT ON COLUMN procurements.sms_special_programs.specialization_label IS
  'What this program calls its second level, for UI labels only: "Area of Specialization", "Sport", "Language". Not every program has one.';

-- ============================================================================
-- 2. SPECIALISATIONS / PROGRAM COMPONENTS
-- ============================================================================
-- No school_id: scope is inherited from the parent program, which is the only
-- reading that cannot drift out of step with it.
CREATE TABLE IF NOT EXISTS procurements.sms_special_program_specializations (
  id                  BIGSERIAL PRIMARY KEY,
  special_program_id  BIGINT NOT NULL
    REFERENCES procurements.sms_special_programs(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_special_program_specializations_code_uniq
  ON procurements.sms_special_program_specializations (special_program_id, upper(code));

CREATE INDEX IF NOT EXISTS idx_sms_special_program_specializations_program
  ON procurements.sms_special_program_specializations (special_program_id, is_active);

COMMENT ON TABLE procurements.sms_special_program_specializations IS
  'Second level of a special program -- an area of specialization, a sport, a language. Optional: a program with no second level simply has no rows here. CASCADEs from its program because it is that program''s own child; the RESTRICTs on sms_subjects and sms_student_special_programs are what actually block a referenced program from being deleted.';

-- ============================================================================
-- 3. PROGRAM MEMBERSHIP  (NOT a subject roster -- see the header)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_student_special_programs (
  id                  BIGSERIAL PRIMARY KEY,
  student_id          BIGINT NOT NULL
    REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  special_program_id  BIGINT NOT NULL
    REFERENCES procurements.sms_special_programs(id) ON DELETE RESTRICT,
  -- NULLABLE: STE and SPJ have no second level, and a learner may be admitted
  -- to a program before their strand is settled.
  specialization_id   BIGINT
    REFERENCES procurements.sms_special_program_specializations(id) ON DELETE RESTRICT,
  school_id           BIGINT NOT NULL REFERENCES procurements.sms_schools(id),
  school_year         TEXT NOT NULL,
  enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by         BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One strand per program per learner per year. Several programs are legal.
  UNIQUE (student_id, special_program_id, school_year)
);

CREATE INDEX IF NOT EXISTS idx_sms_student_special_programs_student
  ON procurements.sms_student_special_programs (student_id, school_year);
CREATE INDEX IF NOT EXISTS idx_sms_student_special_programs_program
  ON procurements.sms_student_special_programs (special_program_id, school_year);
CREATE INDEX IF NOT EXISTS idx_sms_student_special_programs_specialization
  ON procurements.sms_student_special_programs (specialization_id)
  WHERE specialization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_student_special_programs_school
  ON procurements.sms_student_special_programs (school_id, school_year);

COMMENT ON TABLE procurements.sms_student_special_programs IS
  'Which special program (and strand) a learner belongs to in a school year. NOT a subject roster -- that is sms_student_subjects. Membership never creates roster rows; it only prefills the roster modal, one way, on demand.';

-- ============================================================================
-- 4. SUBJECT COLUMNS
-- ============================================================================
-- Added nullable first so the backfill can be WHERE-scoped and counted, then
-- defaulted and set NOT NULL -- 133's own pattern on this same table.
ALTER TABLE procurements.sms_subjects
  ADD COLUMN IF NOT EXISTS selective_enrolment BOOLEAN;

-- THE ONLY DML IN THIS FILE. An exact copy, nothing else.
UPDATE procurements.sms_subjects
   SET selective_enrolment = COALESCE(is_madrasah, false)
 WHERE selective_enrolment IS NULL;

ALTER TABLE procurements.sms_subjects
  ALTER COLUMN selective_enrolment SET DEFAULT false;

ALTER TABLE procurements.sms_subjects
  ALTER COLUMN selective_enrolment SET NOT NULL;

ALTER TABLE procurements.sms_subjects
  ADD COLUMN IF NOT EXISTS special_program_id BIGINT
    REFERENCES procurements.sms_special_programs(id) ON DELETE RESTRICT;

ALTER TABLE procurements.sms_subjects
  ADD COLUMN IF NOT EXISTS specialization_id BIGINT
    REFERENCES procurements.sms_special_program_specializations(id) ON DELETE RESTRICT;

-- Mirrors 034's is_madrasah index: the interesting rows are the few true ones.
CREATE INDEX IF NOT EXISTS idx_sms_subjects_selective_enrolment
  ON procurements.sms_subjects (selective_enrolment)
  WHERE selective_enrolment = true;

CREATE INDEX IF NOT EXISTS idx_sms_subjects_special_program
  ON procurements.sms_subjects (special_program_id)
  WHERE special_program_id IS NOT NULL;

COMMENT ON COLUMN procurements.sms_subjects.selective_enrolment IS
  'This subject has a per-learner roster in sms_student_subjects instead of being taken by everyone holding a section slot. Generic: true of Madrasah/ALS, and settable on any other subject including EPP/TLE components. Says NOTHING about the general average -- that is is_madrasah.';

COMMENT ON COLUMN procurements.sms_subjects.special_program_id IS
  'The special curricular program this subject belongs to (SPA, SPS, ...). Orthogonal to `program` (the curriculum stream) and to selective_enrolment. NULL for ordinary subjects.';

COMMENT ON COLUMN procurements.sms_subjects.specialization_id IS
  'The strand/component within special_program_id (Music, Dance, ...). NULL when the program has no second level or the subject is common to the whole program.';

-- 034's comment described this table as Madrasah's. It has just stopped being
-- that, and a comment that lies is worse than none.
COMMENT ON TABLE procurements.sms_student_subjects IS
  'Per-learner roster for any subject with selective_enrolment = true: which learners in a section actually take it. Originally built for Madrasah (034), generalised by 179 -- it carries Madrasah, ALS, special-program and EPP/TLE rosters alike, with no per-program branches. Independent of sms_student_special_programs (membership).';

-- ============================================================================
-- 5. INTEGRITY
-- ============================================================================

-- C1 -- single table, so a real CHECK: a strand requires its program.
ALTER TABLE procurements.sms_subjects
  DROP CONSTRAINT IF EXISTS sms_subjects_specialization_requires_program_check;

ALTER TABLE procurements.sms_subjects
  ADD CONSTRAINT sms_subjects_specialization_requires_program_check
  CHECK (specialization_id IS NULL OR special_program_id IS NOT NULL);

-- C2/C3 -- cross-table, so a trigger and not a CHECK (the 136 lesson):
--   * the strand must belong to the named program;
--   * the program must be division-wide or the subject's own school's.
CREATE OR REPLACE FUNCTION procurements.check_subject_special_program()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = procurements, public
AS $$
DECLARE
  v_program_school_id BIGINT;
  v_program_exists    BOOLEAN;
  v_strand_program_id BIGINT;
BEGIN
  IF NEW.special_program_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sp.school_id, TRUE
    INTO v_program_school_id, v_program_exists
    FROM procurements.sms_special_programs sp
   WHERE sp.id = NEW.special_program_id;

  IF NOT COALESCE(v_program_exists, FALSE) THEN
    RAISE EXCEPTION 'That special program does not exist.';
  END IF;

  -- A division-wide program (NULL school_id) is usable by every school.
  IF v_program_school_id IS NOT NULL
     AND NEW.school_id IS NOT NULL
     AND v_program_school_id <> NEW.school_id THEN
    RAISE EXCEPTION
      'That special program belongs to another school.';
  END IF;

  IF NEW.specialization_id IS NOT NULL THEN
    SELECT sps.special_program_id
      INTO v_strand_program_id
      FROM procurements.sms_special_program_specializations sps
     WHERE sps.id = NEW.specialization_id;

    IF v_strand_program_id IS NULL THEN
      RAISE EXCEPTION 'That specialization does not exist.';
    END IF;

    IF v_strand_program_id <> NEW.special_program_id THEN
      RAISE EXCEPTION
        'That specialization belongs to a different special program.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_subject_special_program_trigger
  ON procurements.sms_subjects;

CREATE TRIGGER check_subject_special_program_trigger
  BEFORE INSERT OR UPDATE OF special_program_id, specialization_id, school_id
  ON procurements.sms_subjects
  FOR EACH ROW
  EXECUTE FUNCTION procurements.check_subject_special_program();

-- C5 -- the same rule on a membership row.
CREATE OR REPLACE FUNCTION procurements.check_student_special_program()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = procurements, public
AS $$
DECLARE
  v_program_school_id BIGINT;
  v_program_exists    BOOLEAN;
  v_strand_program_id BIGINT;
BEGIN
  SELECT sp.school_id, TRUE
    INTO v_program_school_id, v_program_exists
    FROM procurements.sms_special_programs sp
   WHERE sp.id = NEW.special_program_id;

  IF NOT COALESCE(v_program_exists, FALSE) THEN
    RAISE EXCEPTION 'That special program does not exist.';
  END IF;

  IF v_program_school_id IS NOT NULL
     AND v_program_school_id <> NEW.school_id THEN
    RAISE EXCEPTION
      'That special program belongs to another school.';
  END IF;

  IF NEW.specialization_id IS NOT NULL THEN
    SELECT sps.special_program_id
      INTO v_strand_program_id
      FROM procurements.sms_special_program_specializations sps
     WHERE sps.id = NEW.specialization_id;

    IF v_strand_program_id IS NULL THEN
      RAISE EXCEPTION 'That specialization does not exist.';
    END IF;

    IF v_strand_program_id <> NEW.special_program_id THEN
      RAISE EXCEPTION
        'That specialization belongs to a different special program.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_student_special_program_trigger
  ON procurements.sms_student_special_programs;

CREATE TRIGGER check_student_special_program_trigger
  BEFORE INSERT OR UPDATE
  ON procurements.sms_student_special_programs
  FOR EACH ROW
  EXECUTE FUNCTION procurements.check_student_special_program();

-- C4 -- THE ONE IMPLICATION, and it runs one way only.
--
-- A Madrasah or ALS subject is selectively enrolled by definition (034/133),
-- so the flag is forced on and the UI renders the checkbox checked-and-
-- disabled. The reverse is deliberately absent: ticking selective on an
-- ordinary subject must never make it a Madrasah subject, because that would
-- drop it out of the general average -- which is the entire bug this
-- migration exists to prevent.
--
-- Written as a trigger rather than in AddModal for 133's own reason: a writer
-- that knows only the old shape still lands on a consistent row.
CREATE OR REPLACE FUNCTION procurements.sync_subject_selective_enrolment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = procurements, public
AS $$
BEGIN
  IF COALESCE(NEW.is_madrasah, FALSE) THEN
    NEW.selective_enrolment := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

-- Ordering matters: 133's sync_subject_program_trigger resolves is_madrasah
-- from program, and this one reads the result. Trigger names fire in
-- alphabetical order within the same event, and 's' < 'y' puts
-- sync_subject_program_trigger first. Named to keep it that way.
DROP TRIGGER IF EXISTS zz_sync_subject_selective_enrolment_trigger
  ON procurements.sms_subjects;

CREATE TRIGGER zz_sync_subject_selective_enrolment_trigger
  BEFORE INSERT OR UPDATE
  ON procurements.sms_subjects
  FOR EACH ROW
  EXECUTE FUNCTION procurements.sync_subject_selective_enrolment();

-- ============================================================================
-- 6. GRADE MONITORING DENOMINATOR  (107) -- CORRECTNESS FIX
-- ============================================================================
-- 107 picked the encoding denominator with
--
--   CASE WHEN subj.is_madrasah THEN <roster count> ELSE <section count> END
--
-- which is a ROSTER question wearing the average flag's name. Left alone, a
-- selective EPP/TLE subject with 12 rostered learners would be measured
-- against the whole 45-learner section and read as permanently under-encoded.
--
-- Only the CASE changes. The RETURNS TABLE is untouched -- including the
-- `is_madrasah` column, which the page still uses to label the curriculum
-- program and which would be a lie if it were computed from the new flag -- so
-- this is a plain CREATE OR REPLACE and not 157's DROP-and-recreate.
CREATE OR REPLACE FUNCTION procurements.get_grade_encoding_status(
  p_school_id   BIGINT,
  p_school_year TEXT,
  p_periods     INTEGER DEFAULT 4
)
RETURNS TABLE (
  subject_id        BIGINT,
  subject_name      TEXT,
  is_madrasah       BOOLEAN,
  section_id        BIGINT,
  section_name      TEXT,
  grade_level       INTEGER,
  assigned_teachers TEXT[],
  grading_period    INTEGER,
  expected_learners INTEGER,
  encoded_learners  INTEGER,
  encoders          TEXT[],
  last_encoded_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH periods AS (
    SELECT generate_series(1, GREATEST(COALESCE(p_periods, 4), 1)) AS period
  ),
  sched AS (
    SELECT
      ss.subject_id,
      ss.section_id,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.name), NULL) AS assigned_teachers
    FROM procurements.sms_subject_schedules ss
    LEFT JOIN procurements.sms_users u ON u.id = ss.teacher_id
    WHERE ss.school_id = p_school_id
      AND ss.school_year = p_school_year
    GROUP BY ss.subject_id, ss.section_id
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
    s.assigned_teachers,
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
  CROSS JOIN periods p
  LEFT JOIN enrolled en ON en.section_id = s.section_id
  LEFT JOIN rostered r
    ON r.subject_id = s.subject_id AND r.section_id = s.section_id
  LEFT JOIN encoded e
    ON e.subject_id = s.subject_id
   AND e.section_id = s.section_id
   AND e.grading_period = p.period
  WHERE subj.school_id = p_school_id
  ORDER BY sec.grade_level, sec.name, subj.name, p.period;
$$;

GRANT EXECUTE ON FUNCTION
  procurements.get_grade_encoding_status(BIGINT, TEXT, INTEGER)
  TO authenticated, service_role;

-- ============================================================================
-- 7. GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_special_programs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_special_program_specializations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_student_special_programs TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE
  procurements.sms_special_programs_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE
  procurements.sms_special_program_specializations_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE
  procurements.sms_student_special_programs_id_seq TO authenticated;

-- Deliberately NOT granted to `anon`. 034 did that for sms_student_subjects
-- and it is the hole noted in the header; these tables start clean.

-- ============================================================================
-- 8. RLS -- 125'S SHAPE, VERBATIM
-- ============================================================================
-- The school branch requires `school_id IS NOT NULL`, which is what makes a
-- division-wide row unreachable to a school-level role. The table name is
-- fully qualified on both sides of every comparison: 115's bug was an
-- unqualified `u.school_id = school_id` binding to the inner table -- always
-- true, silently type-valid, and unblocked cross-school writes since 037.

ALTER TABLE procurements.sms_special_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "special_programs_select" ON procurements.sms_special_programs;
CREATE POLICY "special_programs_select"
  ON procurements.sms_special_programs FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "special_programs_insert" ON procurements.sms_special_programs;
CREATE POLICY "special_programs_insert"
  ON procurements.sms_special_programs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND procurements.sms_special_programs.school_id IS NOT NULL
            AND u.school_id = procurements.sms_special_programs.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "special_programs_update" ON procurements.sms_special_programs;
CREATE POLICY "special_programs_update"
  ON procurements.sms_special_programs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND procurements.sms_special_programs.school_id IS NOT NULL
            AND u.school_id = procurements.sms_special_programs.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "special_programs_delete" ON procurements.sms_special_programs;
CREATE POLICY "special_programs_delete"
  ON procurements.sms_special_programs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND procurements.sms_special_programs.school_id IS NOT NULL
            AND u.school_id = procurements.sms_special_programs.school_id
          )
        )
    )
  );

-- Specialisations inherit their parent's scope, so every write policy asks the
-- same question of the parent row.
ALTER TABLE procurements.sms_special_program_specializations
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "special_program_specializations_select"
  ON procurements.sms_special_program_specializations;
CREATE POLICY "special_program_specializations_select"
  ON procurements.sms_special_program_specializations FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "special_program_specializations_insert"
  ON procurements.sms_special_program_specializations;
CREATE POLICY "special_program_specializations_insert"
  ON procurements.sms_special_program_specializations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM procurements.sms_users u
        JOIN procurements.sms_special_programs sp
          ON sp.id = procurements.sms_special_program_specializations.special_program_id
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND sp.school_id IS NOT NULL
            AND u.school_id = sp.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "special_program_specializations_update"
  ON procurements.sms_special_program_specializations;
CREATE POLICY "special_program_specializations_update"
  ON procurements.sms_special_program_specializations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
        FROM procurements.sms_users u
        JOIN procurements.sms_special_programs sp
          ON sp.id = procurements.sms_special_program_specializations.special_program_id
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND sp.school_id IS NOT NULL
            AND u.school_id = sp.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "special_program_specializations_delete"
  ON procurements.sms_special_program_specializations;
CREATE POLICY "special_program_specializations_delete"
  ON procurements.sms_special_program_specializations FOR DELETE
  USING (
    EXISTS (
      SELECT 1
        FROM procurements.sms_users u
        JOIN procurements.sms_special_programs sp
          ON sp.id = procurements.sms_special_program_specializations.special_program_id
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND sp.school_id IS NOT NULL
            AND u.school_id = sp.school_id
          )
        )
    )
  );

-- Membership always names a real school, so there is no NULL branch to guard;
-- the school branch is the whole rule, alongside the division roles.
ALTER TABLE procurements.sms_student_special_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_special_programs_select"
  ON procurements.sms_student_special_programs;
CREATE POLICY "student_special_programs_select"
  ON procurements.sms_student_special_programs FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "student_special_programs_insert"
  ON procurements.sms_student_special_programs;
CREATE POLICY "student_special_programs_insert"
  ON procurements.sms_student_special_programs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR u.school_id = procurements.sms_student_special_programs.school_id
        )
    )
  );

DROP POLICY IF EXISTS "student_special_programs_update"
  ON procurements.sms_student_special_programs;
CREATE POLICY "student_special_programs_update"
  ON procurements.sms_student_special_programs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR u.school_id = procurements.sms_student_special_programs.school_id
        )
    )
  );

DROP POLICY IF EXISTS "student_special_programs_delete"
  ON procurements.sms_student_special_programs;
CREATE POLICY "student_special_programs_delete"
  ON procurements.sms_student_special_programs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR u.school_id = procurements.sms_student_special_programs.school_id
        )
    )
  );

-- ============================================================================
-- 9. updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS update_sms_special_programs_updated_at
  ON procurements.sms_special_programs;
CREATE TRIGGER update_sms_special_programs_updated_at
  BEFORE UPDATE ON procurements.sms_special_programs
  FOR EACH ROW EXECUTE FUNCTION procurements.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sms_special_program_specializations_updated_at
  ON procurements.sms_special_program_specializations;
CREATE TRIGGER update_sms_special_program_specializations_updated_at
  BEFORE UPDATE ON procurements.sms_special_program_specializations
  FOR EACH ROW EXECUTE FUNCTION procurements.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sms_student_special_programs_updated_at
  ON procurements.sms_student_special_programs;
CREATE TRIGGER update_sms_student_special_programs_updated_at
  BEFORE UPDATE ON procurements.sms_student_special_programs
  FOR EACH ROW EXECUTE FUNCTION procurements.update_updated_at_column();
