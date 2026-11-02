-- =============================================================================
-- 226 — Needs Review: how far each school has encoded each module
-- =============================================================================
-- The division office keeps a spreadsheet (one row per school) of how much of
-- each module a school has actually filled in: Books, ARAL (CRLA, Phil-IRI),
-- Examination (TOS, summative, item analysis), Learner Health, Class Record /
-- ECCD / PACE, Attendance, Rooms and SBFP. `division_needs_review(sy)` answers
-- every column of that sheet from the system, one row per active school, so
-- the page at /division/needs-review can flag the schools still behind.
--
-- Counting rules (written once here; `lib/utils/needsReview.ts` only sums and
-- divides):
--   * learners = enrolment that counts as enrolled per 206: status 'approved',
--     lifecycle in ENROLLED_LIFECYCLE_STATUSES, at the enrolment's school,
--     counted once per learner (an SHS learner has two semester rows);
--   * CRLA cohort = enrolled learners in Grades 1-3 (CRLA_GRADES); covered =
--     those with a CRLA record that school year at this school;
--   * Phil-IRI cohort = enrolled learners in Grades 3-10 (the grades the GST
--     and graded passages are given to); covered = those with a Phil-IRI
--     record that school year at this school;
--   * Learner Health covered = enrolled learners with a reading carrying a
--     height or a weight that school year, in a section of this school;
--   * teachers = everyone ASSIGNED teaching work at the school that year —
--     a section's adviser, or the teacher of a schedule in one of its sections
--     (156's definition: a role, not `type`, so a volunteer teacher counts);
--   * Class Record / ECCD / PACE user = one of those teachers who has a class
--     record, an ECCD assessment, a PACE rating or a Kindergarten Progress
--     rating that year at the school;
--   * Attendance: advisers only — attendance is the adviser's register, so a
--     subject teacher could never "use" it; an adviser uses it once any
--     attendance row exists for their section that year;
--   * TOS = this school's own TOS rows for the year (private, school-wide);
--     summative = distinct summative exams (SUMMATIVE_EXAM_TYPES) with a
--     result recorded at the school that year, division exams included;
--     item analysis = results (exam × section) with at least one learner's
--     answers or score row;
--   * books = copies on hand (Σ quantity of active titles) and copies
--     allocated to teachers that year;
--   * rooms complete = active room with name, building, type, capacity,
--     condition and dimension all filled;
--   * SBFP = the year's programme (if opened) and its beneficiaries.
-- Active schools only and the test schools (9, 10) left out, per 206.
--
-- SECURITY DEFINER behind an explicit guard (super admin, division_admin,
-- division_type), the 193 lesson: under RLS several of these tables are
-- school-scoped and the division-wide year is far past PostgREST's row cap.
-- **Only counts leave the function.** It never changes data.
--
-- One new read-only function; no table, column, policy, trigger or DML.
-- Tests: supabase/tests/226_division_needs_review.sql
-- =============================================================================

SET search_path TO procurements, public;

CREATE OR REPLACE FUNCTION procurements.division_needs_review(p_school_year TEXT)
RETURNS TABLE (
  school_id                BIGINT,
  school_name              TEXT,
  district                 TEXT,
  books_total              BIGINT,
  books_allocated          BIGINT,
  crla_learners            BIGINT,
  crla_assessed            BIGINT,
  philiri_learners         BIGINT,
  philiri_assessed         BIGINT,
  tos_count                BIGINT,
  summative_exams          BIGINT,
  item_analyses            BIGINT,
  learners                 BIGINT,
  learners_measured        BIGINT,
  teachers                 BIGINT,
  class_record_teachers    BIGINT,
  advisers                 BIGINT,
  attendance_advisers      BIGINT,
  rooms                    BIGINT,
  rooms_complete           BIGINT,
  sbfp_program             BOOLEAN,
  sbfp_beneficiaries       BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM procurements.sms_users u
     WHERE u.user_id = auth.uid()
       AND u.is_active
       AND u.type IN ('super admin', 'division_admin', 'division_type')
  ) THEN
    RAISE EXCEPTION 'Only the division office may view Needs Review.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH sch AS (
    SELECT s.id, s.name::TEXT AS name, s.district::TEXT AS district
      FROM sms_schools s
     WHERE s.is_active
       AND s.id NOT IN (9, 10)
  ),
  enr AS (
    SELECT DISTINCT ON (e.school_id, e.student_id)
           e.school_id, e.student_id, e.grade_level::INTEGER AS grade_level
      FROM sms_enrollments e
      JOIN sch ON sch.id = e.school_id
     WHERE e.school_year = p_school_year
       AND e.status = 'approved'
       AND e.enrollment_status IN ('active', 'completed', 'promoted', 'retained', 'graduated')
     ORDER BY e.school_id, e.student_id, e.semester DESC NULLS LAST
  ),
  sec AS (
    SELECT x.id, x.school_id, x.section_adviser_id
      FROM sms_sections x
      JOIN sch ON sch.id = x.school_id
     WHERE x.school_year = p_school_year
  ),
  crla AS (
    SELECT DISTINCT r.school_id, r.student_id
      FROM sms_crla_records r
     WHERE r.school_year = p_school_year
  ),
  phil AS (
    SELECT DISTINCT r.school_id, r.student_id
      FROM sms_philiri_records r
     WHERE r.school_year = p_school_year
  ),
  health AS (
    SELECT DISTINCT sec.school_id, h.student_id
      FROM sms_learner_health h
      JOIN sec ON sec.id = h.section_id
     WHERE h.school_year = p_school_year
       AND (h.height_cm IS NOT NULL OR h.weight_kg IS NOT NULL)
  ),
  learner_agg AS (
    SELECT enr.school_id,
           count(*)                                                                AS n,
           count(*) FILTER (WHERE enr.grade_level BETWEEN 1 AND 3)                 AS crla_n,
           count(*) FILTER (WHERE enr.grade_level BETWEEN 1 AND 3 AND crla.student_id IS NOT NULL) AS crla_done,
           count(*) FILTER (WHERE enr.grade_level BETWEEN 3 AND 10)                AS phil_n,
           count(*) FILTER (WHERE enr.grade_level BETWEEN 3 AND 10 AND phil.student_id IS NOT NULL) AS phil_done,
           count(*) FILTER (WHERE health.student_id IS NOT NULL)                   AS measured
      FROM enr
      LEFT JOIN crla   ON crla.school_id = enr.school_id   AND crla.student_id = enr.student_id
      LEFT JOIN phil   ON phil.school_id = enr.school_id   AND phil.student_id = enr.student_id
      LEFT JOIN health ON health.school_id = enr.school_id AND health.student_id = enr.student_id
     GROUP BY enr.school_id
  ),
  teacher AS (
    SELECT sec.school_id, sec.section_adviser_id AS user_id
      FROM sec WHERE sec.section_adviser_id IS NOT NULL
    UNION
    SELECT sec.school_id, ss.teacher_id
      FROM sms_subject_schedules ss
      JOIN sec ON sec.id = ss.section_id
     WHERE ss.teacher_id IS NOT NULL
  ),
  encoder AS (
    SELECT cr.school_id, cr.teacher_id AS user_id
      FROM sms_class_records cr
     WHERE cr.school_year = p_school_year
    UNION
    SELECT sec.school_id, a.assessed_by
      FROM sms_eccd_assessments a JOIN sec ON sec.id = a.section_id
     WHERE a.school_year = p_school_year AND a.assessed_by IS NOT NULL
    UNION
    SELECT sec.school_id, a.assessed_by
      FROM sms_pace_ratings a JOIN sec ON sec.id = a.section_id
     WHERE a.school_year = p_school_year AND a.assessed_by IS NOT NULL
    UNION
    SELECT sec.school_id, a.assessed_by
      FROM sms_kinder_progress_ratings a JOIN sec ON sec.id = a.section_id
     WHERE a.school_year = p_school_year AND a.assessed_by IS NOT NULL
  ),
  teacher_agg AS (
    SELECT t.school_id,
           count(*)                                       AS n,
           count(*) FILTER (WHERE en.user_id IS NOT NULL) AS using_n
      FROM teacher t
      LEFT JOIN encoder en ON en.school_id = t.school_id AND en.user_id = t.user_id
     GROUP BY t.school_id
  ),
  adviser AS (
    SELECT DISTINCT sec.school_id, sec.section_adviser_id AS user_id,
           EXISTS (SELECT 1 FROM sms_attendance a
                    WHERE a.section_id = sec.id AND a.school_year = p_school_year) AS has_att
      FROM sec WHERE sec.section_adviser_id IS NOT NULL
  ),
  adviser_agg AS (
    SELECT a.school_id,
           count(DISTINCT a.user_id)                          AS n,
           count(DISTINCT a.user_id) FILTER (WHERE a.has_att) AS using_n
      FROM adviser a
     GROUP BY a.school_id
  ),
  exam_res AS (
    SELECT r.id, r.school_id, r.exam_id, t.exam_type
      FROM sms_exam_results r
      JOIN sch ON sch.id = r.school_id
      LEFT JOIN sms_exams x ON x.id = r.exam_id
      LEFT JOIN sms_tos t   ON t.id = x.tos_id
     WHERE r.school_year = p_school_year
  ),
  exam_agg AS (
    SELECT er.school_id,
           count(DISTINCT er.exam_id) FILTER (
             WHERE er.exam_type IN ('Summative Test', 'Summative Test 1', 'Summative Test 2')) AS summ,
           count(*) FILTER (
             WHERE EXISTS (SELECT 1 FROM sms_exam_result_students rs WHERE rs.result_id = er.id)) AS ia
      FROM exam_res er
     GROUP BY er.school_id
  ),
  tos_agg AS (
    SELECT t.school_id, count(*) AS n
      FROM sms_tos t JOIN sch ON sch.id = t.school_id
     WHERE t.school_year = p_school_year AND t.is_active
     GROUP BY t.school_id
  ),
  book_agg AS (
    SELECT b.school_id, COALESCE(sum(b.quantity), 0) AS n
      FROM sms_books b JOIN sch ON sch.id = b.school_id
     WHERE b.is_active
     GROUP BY b.school_id
  ),
  alloc_agg AS (
    SELECT a.school_id, COALESCE(sum(a.quantity), 0) AS n
      FROM sms_book_allocations a JOIN sch ON sch.id = a.school_id
     WHERE a.school_year = p_school_year
     GROUP BY a.school_id
  ),
  room_agg AS (
    SELECT r.school_id,
           count(*) AS n,
           count(*) FILTER (
             WHERE NULLIF(trim(r.name), '') IS NOT NULL
               AND NULLIF(trim(r.building), '') IS NOT NULL
               AND NULLIF(trim(r.room_type), '') IS NOT NULL
               AND COALESCE(r.capacity, 0) > 0
               AND NULLIF(trim(r.condition), '') IS NOT NULL
               AND NULLIF(trim(r.dimension), '') IS NOT NULL) AS complete
      FROM sms_rooms r JOIN sch ON sch.id = r.school_id
     WHERE r.is_active
     GROUP BY r.school_id
  ),
  sbfp AS (
    SELECT p.school_id, count(b.id) AS n
      FROM sms_sbfp_programs p
      LEFT JOIN sms_sbfp_beneficiaries b ON b.program_id = p.id
     WHERE p.school_year = p_school_year
     GROUP BY p.school_id
  )
  SELECT sch.id,
         sch.name,
         sch.district,
         COALESCE(book_agg.n, 0)::BIGINT,
         COALESCE(alloc_agg.n, 0)::BIGINT,
         COALESCE(la.crla_n, 0)::BIGINT,
         COALESCE(la.crla_done, 0)::BIGINT,
         COALESCE(la.phil_n, 0)::BIGINT,
         COALESCE(la.phil_done, 0)::BIGINT,
         COALESCE(tos_agg.n, 0)::BIGINT,
         COALESCE(exam_agg.summ, 0)::BIGINT,
         COALESCE(exam_agg.ia, 0)::BIGINT,
         COALESCE(la.n, 0)::BIGINT,
         COALESCE(la.measured, 0)::BIGINT,
         COALESCE(ta.n, 0)::BIGINT,
         COALESCE(ta.using_n, 0)::BIGINT,
         COALESCE(aa.n, 0)::BIGINT,
         COALESCE(aa.using_n, 0)::BIGINT,
         COALESCE(room_agg.n, 0)::BIGINT,
         COALESCE(room_agg.complete, 0)::BIGINT,
         (sbfp.school_id IS NOT NULL),
         COALESCE(sbfp.n, 0)::BIGINT
    FROM sch
    LEFT JOIN learner_agg la ON la.school_id = sch.id
    LEFT JOIN teacher_agg ta ON ta.school_id = sch.id
    LEFT JOIN adviser_agg aa ON aa.school_id = sch.id
    LEFT JOIN exam_agg       ON exam_agg.school_id = sch.id
    LEFT JOIN tos_agg        ON tos_agg.school_id = sch.id
    LEFT JOIN book_agg       ON book_agg.school_id = sch.id
    LEFT JOIN alloc_agg      ON alloc_agg.school_id = sch.id
    LEFT JOIN room_agg       ON room_agg.school_id = sch.id
    LEFT JOIN sbfp           ON sbfp.school_id = sch.id
   ORDER BY sch.name;
END;
$$;

REVOKE ALL ON FUNCTION procurements.division_needs_review(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.division_needs_review(TEXT) TO authenticated;
