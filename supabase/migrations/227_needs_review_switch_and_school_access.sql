-- =============================================================================
-- 227 — Needs Review: super admin on/off switch, and school heads / admins
--       see their own school
-- =============================================================================
-- (a) Switch. `sms_needs_review_settings` is one row, the shape of 221's
--     `sms_sbfp_settings`, changed only through `needs_review_set_enabled`,
--     which refuses anyone but the active `super admin` (invariant 12).
--     **The default is ON** (the 221 rule): /division/needs-review is already
--     in use, so nothing moves on apply. Off hides every menu link and page,
--     and `division_needs_review` refuses everyone except a super admin, who
--     can still look before switching it back on. Nothing is stored by the
--     module, so there is nothing to delete or keep.
--
-- (b) School access. `division_needs_review` now also admits the active
--     `school_head` and `admin`, and returns them ONE row: their active
--     school (`sms_users.school_id`, invariant 13). The scope is decided here,
--     not in the page — a school head calling the RPC from the console still
--     gets only their own school. Division roles keep 226's exact output
--     (every active school, test schools 9/10 out). A school-level caller's
--     own school is returned even if it is a test school, per 142's rule that
--     a named school is a deliberate lookup, not an aggregate.
--     `assistant_school_head` is deliberately not admitted (not requested).
--
-- The function body below is 226's verbatim except the guard block and the
-- `sch` CTE's WHERE. Same signature and result type, so CREATE OR REPLACE
-- keeps its grants. Before applying to production, compare the live body
-- with 226's file (`SELECT pg_get_functiondef('procurements.division_needs_review(text)'::regprocedure);`)
-- — stop if production carries something 226's file lacks (116/157).
--
-- One new table (+ its single row, the only DML), two new functions, one
-- function replaced. No policy or trigger touched.
-- Tests: supabase/tests/227_needs_review_switch.sql
-- =============================================================================

SET search_path TO procurements, public;

CREATE TABLE IF NOT EXISTS procurements.sms_needs_review_settings (
  id         BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO procurements.sms_needs_review_settings (id) VALUES (TRUE)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE procurements.sms_needs_review_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "needs review settings select" ON procurements.sms_needs_review_settings;
CREATE POLICY "needs review settings select" ON procurements.sms_needs_review_settings
  FOR SELECT TO authenticated
  USING (TRUE);
REVOKE ALL ON procurements.sms_needs_review_settings FROM anon, authenticated, PUBLIC;
GRANT SELECT ON procurements.sms_needs_review_settings TO authenticated;
GRANT ALL ON procurements.sms_needs_review_settings TO service_role;

-- A missing row reads as ON, matching the default.
CREATE OR REPLACE FUNCTION procurements.needs_review_enabled()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT COALESCE((SELECT is_enabled FROM sms_needs_review_settings WHERE id), TRUE);
$$;

CREATE OR REPLACE FUNCTION procurements.needs_review_set_enabled(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_me BIGINT;
BEGIN
  SELECT u.id INTO v_me FROM sms_users u
   WHERE u.user_id = auth.uid()
     AND u.type = 'super admin'
     AND u.is_active IS NOT FALSE
     AND u.deleted_at IS NULL
   LIMIT 1;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Only a super admin can turn Needs Review on or off.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO sms_needs_review_settings (id, is_enabled, updated_by, updated_at)
  VALUES (TRUE, COALESCE(p_enabled, TRUE), v_me, now())
  ON CONFLICT (id) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION procurements.needs_review_set_enabled(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.needs_review_set_enabled(BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION procurements.needs_review_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION procurements.needs_review_enabled() TO authenticated, service_role;

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
DECLARE
  v_type  TEXT;
  v_home  BIGINT;
  v_scope BIGINT;   -- NULL = the whole division
BEGIN
  SELECT u.type, u.school_id INTO v_type, v_home
    FROM procurements.sms_users u
   WHERE u.user_id = auth.uid()
     AND u.is_active
   LIMIT 1;

  IF v_type IN ('super admin', 'division_admin', 'division_type') THEN
    v_scope := NULL;
  ELSIF v_type IN ('school_head', 'admin') AND v_home IS NOT NULL THEN
    v_scope := v_home;
  ELSE
    RAISE EXCEPTION 'Only the division office, a school head or a school admin may view Needs Review.'
      USING ERRCODE = '42501';
  END IF;

  IF v_type <> 'super admin' AND NOT procurements.needs_review_enabled() THEN
    RAISE EXCEPTION 'Needs Review is turned off.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH sch AS (
    SELECT s.id, s.name::TEXT AS name, s.district::TEXT AS district
      FROM sms_schools s
     WHERE s.is_active
       AND CASE WHEN v_scope IS NULL THEN s.id NOT IN (9, 10)
                ELSE s.id = v_scope END
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
