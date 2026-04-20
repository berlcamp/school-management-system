-- ============================================================================
-- DIVISION REPORTS: TEACHING SPECIALIZATION + LOCK SY
-- ============================================================================
-- Phase 4: Teaching Specialization submission-based report + division admin
-- bulk lock/unlock RPC. Reuses sms_division_report_submissions (migration 072)
-- and the can_write_submission RLS helper.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- 1. sms_report_teaching_specialization_rows
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_report_teaching_specialization_rows (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL
    REFERENCES procurements.sms_division_report_submissions(id) ON DELETE CASCADE,
  learning_area TEXT NOT NULL,
  male INT NOT NULL DEFAULT 0 CHECK (male >= 0),
  female INT NOT NULL DEFAULT 0 CHECK (female >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, learning_area)
);

CREATE INDEX IF NOT EXISTS idx_teaching_spec_rows_submission
  ON procurements.sms_report_teaching_specialization_rows (submission_id);

ALTER TABLE procurements.sms_report_teaching_specialization_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teaching_spec_select"
  ON procurements.sms_report_teaching_specialization_rows;
CREATE POLICY "teaching_spec_select"
  ON procurements.sms_report_teaching_specialization_rows FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "teaching_spec_write"
  ON procurements.sms_report_teaching_specialization_rows;
CREATE POLICY "teaching_spec_write"
  ON procurements.sms_report_teaching_specialization_rows FOR ALL
  USING (procurements.can_write_submission(submission_id))
  WITH CHECK (procurements.can_write_submission(submission_id));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_report_teaching_specialization_rows TO authenticated;
GRANT USAGE, SELECT
  ON SEQUENCE procurements.sms_report_teaching_specialization_rows_id_seq TO authenticated;

-- ============================================================================
-- 2. RPC: upsert_teaching_specialization_rows
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.upsert_teaching_specialization_rows(
  p_submission_id BIGINT,
  p_rows JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = procurements, public
AS $$
DECLARE
  r JSONB;
BEGIN
  DELETE FROM procurements.sms_report_teaching_specialization_rows
  WHERE submission_id = p_submission_id;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF COALESCE((r->>'male')::int, 0) > 0
       OR COALESCE((r->>'female')::int, 0) > 0 THEN
      INSERT INTO procurements.sms_report_teaching_specialization_rows
        (submission_id, learning_area, male, female)
      VALUES (
        p_submission_id,
        r->>'learning_area',
        COALESCE((r->>'male')::int, 0),
        COALESCE((r->>'female')::int, 0)
      );
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION procurements.upsert_teaching_specialization_rows(BIGINT, JSONB)
  TO authenticated;

-- ============================================================================
-- 3. RPC: division_teaching_specialization_summary
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_teaching_specialization_summary(
  p_school_year TEXT
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  learning_area TEXT,
  male INT,
  female INT,
  total INT,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH latest AS (
    SELECT
      s.id AS school_id,
      s.name AS school_name,
      sub.id AS submission_id,
      sub.status
    FROM procurements.sms_schools s
    LEFT JOIN procurements.sms_division_report_submissions sub
      ON sub.school_id = s.id
      AND sub.school_year = p_school_year
      AND sub.semester IS NULL
      AND sub.report_type = 'teaching_specialization'
    WHERE s.is_active
  )
  SELECT
    latest.school_id,
    latest.school_name,
    COALESCE(r.learning_area, '') AS learning_area,
    COALESCE(r.male, 0) AS male,
    COALESCE(r.female, 0) AS female,
    COALESCE(r.male, 0) + COALESCE(r.female, 0) AS total,
    COALESCE(latest.status, 'missing') AS status
  FROM latest
  LEFT JOIN procurements.sms_report_teaching_specialization_rows r
    ON r.submission_id = latest.submission_id
  ORDER BY latest.school_name, learning_area;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_teaching_specialization_summary(TEXT)
  TO authenticated;

-- ============================================================================
-- 4. RPC: bulk_lock_submissions
--    Division admin only. Flips status between 'locked' and 'submitted'
--    for all matching submissions in a given (SY, optional semester, optional type).
--    Only submissions currently in 'submitted' or 'locked' are affected — drafts
--    are ignored to avoid locking empty drafts.
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.bulk_lock_submissions(
  p_school_year TEXT,
  p_lock BOOLEAN,
  p_semester SMALLINT DEFAULT NULL,
  p_report_type TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  affected INT;
BEGIN
  -- Division admin only
  IF NOT EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND u.is_active
      AND u.type IN ('division_admin','division_type')
  ) THEN
    RAISE EXCEPTION 'Only division admins may lock/unlock submissions';
  END IF;

  UPDATE procurements.sms_division_report_submissions
  SET
    status = CASE WHEN p_lock THEN 'locked' ELSE 'submitted' END,
    updated_at = NOW()
  WHERE school_year = p_school_year
    AND (p_semester IS NULL OR semester = p_semester OR
         (p_semester IS NULL AND semester IS NULL))
    AND (p_report_type IS NULL OR report_type = p_report_type)
    AND status IN ('submitted','locked')
    AND status <> (CASE WHEN p_lock THEN 'locked' ELSE 'submitted' END);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION procurements.bulk_lock_submissions(TEXT, BOOLEAN, SMALLINT, TEXT)
  TO authenticated;

-- ============================================================================
-- 5. RPC: division_submissions_overview
--    Lists every (school × SY × semester × report_type) slot with its current
--    status. Powers the Lock-SY admin page and helps spot missing submissions.
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_submissions_overview(
  p_school_year TEXT
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  report_type TEXT,
  semester SMALLINT,
  submission_id BIGINT,
  status TEXT,
  submitted_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH slots AS (
    SELECT s.id AS school_id, s.name AS school_name, rt.report_type, sem.semester
    FROM procurements.sms_schools s
    CROSS JOIN (
      VALUES
        ('enrollment'::TEXT),
        ('track_strand'),
        ('shs_specialization'),
        ('teaching_specialization')
    ) AS rt(report_type)
    CROSS JOIN (
      VALUES (NULL::SMALLINT), (1::SMALLINT), (2::SMALLINT)
    ) AS sem(semester)
    WHERE s.is_active
      AND (
        (rt.report_type IN ('enrollment','teaching_specialization') AND sem.semester IS NULL)
        OR (rt.report_type IN ('track_strand','shs_specialization') AND sem.semester IS NOT NULL)
      )
  )
  SELECT
    slots.school_id,
    slots.school_name,
    slots.report_type,
    slots.semester,
    sub.id AS submission_id,
    COALESCE(sub.status, 'missing') AS status,
    sub.submitted_at
  FROM slots
  LEFT JOIN procurements.sms_division_report_submissions sub
    ON sub.school_id = slots.school_id
    AND sub.school_year = p_school_year
    AND sub.report_type = slots.report_type
    AND (
      (slots.semester IS NULL AND sub.semester IS NULL)
      OR sub.semester = slots.semester
    )
  ORDER BY slots.school_name, slots.report_type, slots.semester NULLS FIRST;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_submissions_overview(TEXT)
  TO authenticated;

COMMENT ON TABLE procurements.sms_report_teaching_specialization_rows IS
  'Teaching Specialization submission detail: teachers by learning area';
