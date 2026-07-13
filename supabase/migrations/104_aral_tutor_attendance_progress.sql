-- ============================================================================
-- ARAL — Tutor Attendance + Individual Progress Tracker
--
-- Two tutor-facing tools layered on top of the ARAL roster (sms_aral_enrollments):
--
--   1. Attendance — a per-session-date grid. The tutor adds session dates as the
--      program runs (sms_aral_attendance_dates) and marks each learner
--      Present / Absent / Late / Excused per date (sms_aral_attendance).
--
--   2. Individual Progress Tracker — mirrors the DepEd "Individual Progress
--      Tracker" sheet: Week 1..8, each week with a DYNAMIC number of session
--      columns the tutor defines (sms_aral_progress_sessions, each with a topic
--      label). Per learner per session the tutor records a Phil-IRI reading
--      level (IDL / ISL / FL) plus an optional note (sms_aral_progress_marks).
--
-- Session/date columns are scoped to the TUTOR + school_year (a tutor's whole
-- roster shares one column set), matching the "My Learners" page which lists all
-- of a tutor's learners together. Marks reference the ARAL enrollment so they
-- follow the learner. Scoping is enforced in the app layer (RLS = authenticated),
-- matching sms_aral_enrollments and the assessment modules.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. ATTENDANCE — session dates (column definitions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_aral_attendance_dates (
  id BIGSERIAL PRIMARY KEY,
  tutor_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  session_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tutor_id, school_year, session_date)
);

COMMENT ON TABLE procurements.sms_aral_attendance_dates IS
  'ARAL tutor attendance session dates; one column per date, scoped to tutor + school year.';

CREATE INDEX IF NOT EXISTS idx_sms_aral_attendance_dates_scope
  ON procurements.sms_aral_attendance_dates(tutor_id, school_year);

CREATE TRIGGER update_sms_aral_attendance_dates_updated_at
  BEFORE UPDATE ON procurements.sms_aral_attendance_dates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. ATTENDANCE — per learner per date
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_aral_attendance (
  id BIGSERIAL PRIMARY KEY,
  date_id BIGINT NOT NULL REFERENCES procurements.sms_aral_attendance_dates(id) ON DELETE CASCADE,
  enrollment_id BIGINT NOT NULL REFERENCES procurements.sms_aral_enrollments(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date_id, enrollment_id)
);

COMMENT ON TABLE procurements.sms_aral_attendance IS
  'ARAL tutor attendance marks; one row per learner per session date.';

CREATE INDEX IF NOT EXISTS idx_sms_aral_attendance_date
  ON procurements.sms_aral_attendance(date_id);
CREATE INDEX IF NOT EXISTS idx_sms_aral_attendance_enrollment
  ON procurements.sms_aral_attendance(enrollment_id);

CREATE TRIGGER update_sms_aral_attendance_updated_at
  BEFORE UPDATE ON procurements.sms_aral_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. PROGRESS TRACKER — session columns (dynamic per week)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_aral_progress_sessions (
  id BIGSERIAL PRIMARY KEY,
  tutor_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 8),
  session_no INTEGER NOT NULL CHECK (session_no >= 1),
  label TEXT,                                     -- topic/focus, e.g. 'Mm, Ss, Aa, Ii'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tutor_id, school_year, week, session_no)
);

COMMENT ON TABLE procurements.sms_aral_progress_sessions IS
  'ARAL Individual Progress Tracker session columns; dynamic count per week, scoped to tutor + school year.';

CREATE INDEX IF NOT EXISTS idx_sms_aral_progress_sessions_scope
  ON procurements.sms_aral_progress_sessions(tutor_id, school_year, week);

CREATE TRIGGER update_sms_aral_progress_sessions_updated_at
  BEFORE UPDATE ON procurements.sms_aral_progress_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. PROGRESS TRACKER — per learner per session mark
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_aral_progress_marks (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES procurements.sms_aral_progress_sessions(id) ON DELETE CASCADE,
  enrollment_id BIGINT NOT NULL REFERENCES procurements.sms_aral_enrollments(id) ON DELETE CASCADE,
  level TEXT CHECK (level IN ('IDL', 'ISL', 'FL')),   -- Phil-IRI: Independent / Instructional / Frustration
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, enrollment_id)
);

COMMENT ON TABLE procurements.sms_aral_progress_marks IS
  'ARAL Individual Progress Tracker marks; one row per learner per session (reading level + note).';

CREATE INDEX IF NOT EXISTS idx_sms_aral_progress_marks_session
  ON procurements.sms_aral_progress_marks(session_id);
CREATE INDEX IF NOT EXISTS idx_sms_aral_progress_marks_enrollment
  ON procurements.sms_aral_progress_marks(enrollment_id);

CREATE TRIGGER update_sms_aral_progress_marks_updated_at
  BEFORE UPDATE ON procurements.sms_aral_progress_marks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- RLS + GRANTS (scoping enforced in the app layer)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_aral_attendance_dates',
    'sms_aral_attendance',
    'sms_aral_progress_sessions',
    'sms_aral_progress_marks'
  ] LOOP
    EXECUTE format('ALTER TABLE procurements.%1$s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
