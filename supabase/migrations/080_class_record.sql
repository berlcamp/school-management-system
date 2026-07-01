-- ============================================================================
-- CLASS RECORD (DepEd 2026-2027 MATATAG, 3-term grading)
--
-- A teacher's working grade book for one subject + section + term + school year.
-- Three components (editable weights per record):
--   WW = Written / Oral Works
--   PT = Product / Performance Tasks
--   ST = Summative Tests & Term Exams
-- Teachers define dynamic columns (items) per component, enter raw scores, and
-- the computed Term Grade is posted into procurements.sms_grades (auto-populate).
--
-- Coexistence: terms 1-3 reuse sms_grades.grading_period (CHECK 1-4 already
-- covers 1-3); term-vs-quarter is derived from the school year in the app layer.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. CLASS RECORDS (one per subject/section/term/school-year)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_class_records (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE RESTRICT,
  subject_id BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  grading_period INTEGER NOT NULL CHECK (grading_period BETWEEN 1 AND 3), -- 1st/2nd/3rd Term
  term_start DATE,
  term_end DATE,
  ww_weight NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (ww_weight >= 0 AND ww_weight <= 100),
  pt_weight NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (pt_weight >= 0 AND pt_weight <= 100),
  st_weight NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (st_weight >= 0 AND st_weight <= 100),
  use_transmutation BOOLEAN NOT NULL DEFAULT false,
  is_posted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, section_id, school_year, grading_period)
);

COMMENT ON TABLE procurements.sms_class_records IS
  'DepEd 3-term class record header: weights + term dates per subject/section/term/school-year.';

CREATE INDEX IF NOT EXISTS idx_sms_class_records_school   ON procurements.sms_class_records(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_class_records_teacher  ON procurements.sms_class_records(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sms_class_records_section  ON procurements.sms_class_records(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_class_records_sy_term  ON procurements.sms_class_records(school_year, grading_period);

CREATE TRIGGER update_sms_class_records_updated_at
  BEFORE UPDATE ON procurements.sms_class_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. CLASS RECORD ITEMS (teacher-defined columns per component)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_class_record_items (
  id BIGSERIAL PRIMARY KEY,
  class_record_id BIGINT NOT NULL REFERENCES procurements.sms_class_records(id) ON DELETE CASCADE,
  component TEXT NOT NULL CHECK (component IN ('WW', 'PT', 'ST')),
  label TEXT,                                  -- activity title ("click to edit")
  max_score NUMERIC(7,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  position INTEGER NOT NULL DEFAULT 0,          -- column order within component
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_class_record_items IS
  'Dynamic assessment columns (WW1, PT1, ST1...) belonging to a class record.';

CREATE INDEX IF NOT EXISTS idx_sms_class_record_items_record
  ON procurements.sms_class_record_items(class_record_id, component, position);

CREATE TRIGGER update_sms_class_record_items_updated_at
  BEFORE UPDATE ON procurements.sms_class_record_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. CLASS RECORD SCORES (one raw score per item per learner)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_class_record_scores (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES procurements.sms_class_record_items(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  raw_score NUMERIC(7,2) CHECK (raw_score >= 0), -- NULL = not yet entered
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, student_id)
);

COMMENT ON TABLE procurements.sms_class_record_scores IS
  'Raw score per learner per assessment column. NULL means not yet entered.';

CREATE INDEX IF NOT EXISTS idx_sms_class_record_scores_item    ON procurements.sms_class_record_scores(item_id);
CREATE INDEX IF NOT EXISTS idx_sms_class_record_scores_student ON procurements.sms_class_record_scores(student_id);

CREATE TRIGGER update_sms_class_record_scores_updated_at
  BEFORE UPDATE ON procurements.sms_class_record_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. DepEd transmutation (DO 8, s.2015 table). Used only when
--    use_transmutation = true; otherwise the rounded Initial Grade is final.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_transmute_grade(p_initial NUMERIC)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_initial IS NULL          THEN NULL
    WHEN p_initial >= 100           THEN 100
    WHEN p_initial >= 98.40         THEN 99
    WHEN p_initial >= 96.80         THEN 98
    WHEN p_initial >= 95.20         THEN 97
    WHEN p_initial >= 93.60         THEN 96
    WHEN p_initial >= 92.00         THEN 95
    WHEN p_initial >= 90.40         THEN 94
    WHEN p_initial >= 88.80         THEN 93
    WHEN p_initial >= 87.20         THEN 92
    WHEN p_initial >= 85.60         THEN 91
    WHEN p_initial >= 84.00         THEN 90
    WHEN p_initial >= 82.40         THEN 89
    WHEN p_initial >= 80.80         THEN 88
    WHEN p_initial >= 79.20         THEN 87
    WHEN p_initial >= 77.60         THEN 86
    WHEN p_initial >= 76.00         THEN 85
    WHEN p_initial >= 74.40         THEN 84
    WHEN p_initial >= 72.80         THEN 83
    WHEN p_initial >= 71.20         THEN 82
    WHEN p_initial >= 69.60         THEN 81
    WHEN p_initial >= 68.00         THEN 80
    WHEN p_initial >= 66.40         THEN 79
    WHEN p_initial >= 64.80         THEN 78
    WHEN p_initial >= 63.20         THEN 77
    WHEN p_initial >= 61.60         THEN 76
    WHEN p_initial >= 60.00         THEN 75
    WHEN p_initial >= 56.00         THEN 74
    WHEN p_initial >= 52.00         THEN 73
    WHEN p_initial >= 48.00         THEN 72
    WHEN p_initial >= 44.00         THEN 71
    WHEN p_initial >= 40.00         THEN 70
    WHEN p_initial >= 36.00         THEN 69
    WHEN p_initial >= 32.00         THEN 68
    WHEN p_initial >= 28.00         THEN 67
    WHEN p_initial >= 24.00         THEN 66
    WHEN p_initial >= 20.00         THEN 65
    WHEN p_initial >= 16.00         THEN 64
    WHEN p_initial >= 12.00         THEN 63
    WHEN p_initial >= 8.00          THEN 62
    WHEN p_initial >= 4.00          THEN 61
    ELSE 60
  END;
$$;

-- ----------------------------------------------------------------------------
-- 5. POST CLASS RECORD GRADES -> sms_grades
--    Computes each enrolled learner's term grade and upserts into sms_grades.
--    Learners with no scores entered are skipped (no 0-grade noise).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.post_class_record_grades(p_class_record_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO procurements, public
AS $$
DECLARE
  rec          procurements.sms_class_records%ROWTYPE;
  v_student_id BIGINT;
  v_ww         NUMERIC;
  v_pt         NUMERIC;
  v_st         NUMERIC;
  v_initial    NUMERIC;
  v_term       INTEGER;
  v_posted     INTEGER := 0;
  v_has_score  BOOLEAN;
BEGIN
  SELECT * INTO rec FROM procurements.sms_class_records WHERE id = p_class_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class record % not found', p_class_record_id;
  END IF;

  FOR v_student_id IN
    SELECT e.student_id
    FROM procurements.sms_enrollments e
    WHERE e.section_id = rec.section_id
      AND e.school_year = rec.school_year
      AND e.status = 'approved'
      AND e.enrollment_status IN ('active', 'promoted', 'graduated', 'retained', 'completed')
  LOOP
    -- Skip learners with no score entered anywhere in this record.
    SELECT EXISTS (
      SELECT 1
      FROM procurements.sms_class_record_scores s
      JOIN procurements.sms_class_record_items i ON i.id = s.item_id
      WHERE i.class_record_id = rec.id
        AND s.student_id = v_student_id
        AND s.raw_score IS NOT NULL
    ) INTO v_has_score;

    IF NOT v_has_score THEN
      CONTINUE;
    END IF;

    -- Per-component percentage score (missing scores count as 0 on post).
    v_ww := procurements.sms_class_record_component_ps(rec.id, v_student_id, 'WW');
    v_pt := procurements.sms_class_record_component_ps(rec.id, v_student_id, 'PT');
    v_st := procurements.sms_class_record_component_ps(rec.id, v_student_id, 'ST');

    v_initial := COALESCE(v_ww, 0) * rec.ww_weight / 100.0
               + COALESCE(v_pt, 0) * rec.pt_weight / 100.0
               + COALESCE(v_st, 0) * rec.st_weight / 100.0;

    IF rec.use_transmutation THEN
      v_term := procurements.sms_transmute_grade(v_initial);
    ELSE
      v_term := ROUND(v_initial);
    END IF;

    INSERT INTO procurements.sms_grades (
      student_id, subject_id, section_id, grading_period, school_year,
      grade, remarks, teacher_id
    ) VALUES (
      v_student_id, rec.subject_id, rec.section_id, rec.grading_period, rec.school_year,
      v_term, CASE WHEN v_term >= 75 THEN 'Passed' ELSE 'Failed' END, rec.teacher_id
    )
    ON CONFLICT (student_id, subject_id, section_id, grading_period, school_year)
    DO UPDATE SET
      grade = EXCLUDED.grade,
      remarks = EXCLUDED.remarks,
      teacher_id = EXCLUDED.teacher_id,
      updated_at = NOW();

    v_posted := v_posted + 1;
  END LOOP;

  UPDATE procurements.sms_class_records SET is_posted = true, updated_at = NOW()
  WHERE id = rec.id;

  RETURN v_posted;
END;
$$;

-- Percentage score for one component: SUM(raw) / SUM(max) * 100 over all the
-- component's columns (missing scores treated as 0). NULL if no columns exist.
CREATE OR REPLACE FUNCTION procurements.sms_class_record_component_ps(
  p_class_record_id BIGINT,
  p_student_id BIGINT,
  p_component TEXT
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN SUM(i.max_score) IS NULL OR SUM(i.max_score) = 0 THEN NULL
    ELSE ROUND(SUM(COALESCE(s.raw_score, 0)) / SUM(i.max_score) * 100, 2)
  END
  FROM procurements.sms_class_record_items i
  LEFT JOIN procurements.sms_class_record_scores s
    ON s.item_id = i.id AND s.student_id = p_student_id
  WHERE i.class_record_id = p_class_record_id
    AND i.component = p_component;
$$;

-- ----------------------------------------------------------------------------
-- 6. RLS + GRANTS (school/teacher scoping enforced in the app layer, matching
--    the sms_grades / sms_mps convention).
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_class_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_class_record_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_class_record_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Class records: select" ON procurements.sms_class_records
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Class records: insert" ON procurements.sms_class_records
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Class records: update" ON procurements.sms_class_records
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Class records: delete" ON procurements.sms_class_records
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Class record items: select" ON procurements.sms_class_record_items
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Class record items: insert" ON procurements.sms_class_record_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Class record items: update" ON procurements.sms_class_record_items
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Class record items: delete" ON procurements.sms_class_record_items
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Class record scores: select" ON procurements.sms_class_record_scores
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Class record scores: insert" ON procurements.sms_class_record_scores
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Class record scores: update" ON procurements.sms_class_record_scores
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Class record scores: delete" ON procurements.sms_class_record_scores
  FOR DELETE USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_class_records       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_class_record_items  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_class_record_scores TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE procurements.sms_class_records_id_seq       TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_class_record_items_id_seq  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_class_record_scores_id_seq TO authenticated;

GRANT EXECUTE ON FUNCTION procurements.sms_transmute_grade(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sms_class_record_component_ps(BIGINT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.post_class_record_grades(BIGINT) TO authenticated;
