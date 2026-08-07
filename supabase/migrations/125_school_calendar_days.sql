-- ============================================================================
-- SCHOOL CALENDAR — NON-CLASS DAYS (and their inverse)
-- ============================================================================
-- Until now nothing in the schema modelled a day without classes. The monthly
-- attendance grid enumerated every Mon-Fri of the month and treated a missing
-- cell as PRESENT, so a holiday silently credited every learner with a full
-- day; SF2's "No. of Days of Classes" counted the same weekday slots, so the
-- denominator was inflated by exactly the days that were never held. Both the
-- numerator and the denominator were wrong, in opposite directions.
--
-- The two cases schools hit constantly:
--
--   * regular and special non-working holidays (national, and local ones like
--     the city fiesta or a division-called activity)
--   * the opening weeks, where the calendar month has started but classes have
--     not -- enrolment week is not attendance week
--
-- Modelled once per school per date, never per learner. A "holiday" is a fact
-- about the school, not about each of 40 children; storing it per learner
-- would multiply one fact across N rows and would lose the day entirely for a
-- section with no enrolees yet -- exactly the opening-week case.
--
-- Design notes:
--
--   * `school_id` NULL = division-wide, per the 106/118 convention. The
--     division office enters the DepEd holiday calendar once and every school
--     inherits it; a school adds only its own local entries.
--   * A date RANGE, not one row per date. "First two weeks -- enrolment, no
--     classes" is one row, and moving the opening date is one edit rather than
--     a delete-and-reinsert. Callers expand to a set of dates; a month is at
--     most 31 keys, so this is cheap client-side.
--   * `period` ('whole' | 'am' | 'pm') because suspensions here are routinely
--     half-day (a signal raised at noon cancels the PM session only). Half a
--     column is awkward to retrofit once totals depend on it.
--   * `day_type = 'class_day'` is the INVERSE entry: there ARE classes. It is
--     what makes precedence unambiguous when a school holds a make-up class on
--     a division no-class day, and it is the only way a Saturday can appear in
--     the grid at all (make-up classes after a suspension). Resolution order,
--     implemented in lib/utils/schoolCalendar.ts and applied identically by the
--     grid, SF2 and the report card: a `class_day` covering the date wins over
--     any blocking row, whatever its scope.
--
-- Deliberately NOT done: no attendance row is deleted or rewritten here. Rows
-- already saved against a date that later turns out to be a holiday simply
-- stop being counted -- the calendar is the authority at read time. That keeps
-- a mis-entered holiday fully reversible and touches no learner data.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. The table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_school_calendar_days (
  id BIGSERIAL PRIMARY KEY,
  -- NULL = division-wide, inherited by every school (106/118 convention)
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('holiday', 'no_class', 'suspension', 'class_day')),
  period TEXT NOT NULL DEFAULT 'whole' CHECK (period IN ('whole', 'am', 'pm')),
  title TEXT NOT NULL,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_school_calendar_days_range_ck CHECK (end_date >= start_date)
);

-- No unique constraint on (school_id, start_date): overlapping entries are
-- legitimate and common -- a one-day suspension declared inside a week already
-- marked as a school activity is two true facts, and both merely block.

CREATE INDEX IF NOT EXISTS idx_sms_school_calendar_days_scope
  ON procurements.sms_school_calendar_days(school_year, school_id);
CREATE INDEX IF NOT EXISTS idx_sms_school_calendar_days_range
  ON procurements.sms_school_calendar_days(start_date, end_date);

DROP TRIGGER IF EXISTS update_sms_school_calendar_days_updated_at
  ON procurements.sms_school_calendar_days;
CREATE TRIGGER update_sms_school_calendar_days_updated_at
  BEFORE UPDATE ON procurements.sms_school_calendar_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE procurements.sms_school_calendar_days IS
  'Calendar exceptions: dates with no classes (holiday / no_class / suspension) and their inverse (class_day, e.g. a Saturday make-up). NULL school_id = division-wide. Authoritative denominator for the attendance grid, SF2 days-of-classes, and report card attendance.';
COMMENT ON COLUMN procurements.sms_school_calendar_days.school_id IS
  'NULL = division-wide entry inherited by every school; set = that school only (106/118 convention).';
COMMENT ON COLUMN procurements.sms_school_calendar_days.period IS
  'whole | am | pm. Half-day suspensions block one session only; the other session still counts toward the day.';
COMMENT ON COLUMN procurements.sms_school_calendar_days.day_type IS
  'class_day is the inverse entry (classes ARE held) and overrides any blocking row covering the same date, whatever its scope.';

-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------
-- Readable by every authenticated user: the calendar is a denominator, and
-- SF2 / report card generation for any school needs it. Writes follow the
-- 113 shape -- division roles anywhere, school roles only within their own
-- school, and only division roles may touch a division-wide (NULL) row.
--
-- Note the qualified `sms_school_calendar_days.school_id` on both sides of
-- every comparison: 115's bug was an unqualified `u.school_id = school_id`
-- binding to the inner table, always true and silently type-valid.
ALTER TABLE procurements.sms_school_calendar_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_calendar_days_select" ON procurements.sms_school_calendar_days;
CREATE POLICY "school_calendar_days_select"
  ON procurements.sms_school_calendar_days FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "school_calendar_days_insert" ON procurements.sms_school_calendar_days;
CREATE POLICY "school_calendar_days_insert"
  ON procurements.sms_school_calendar_days FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND procurements.sms_school_calendar_days.school_id IS NOT NULL
            AND u.school_id = procurements.sms_school_calendar_days.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "school_calendar_days_update" ON procurements.sms_school_calendar_days;
CREATE POLICY "school_calendar_days_update"
  ON procurements.sms_school_calendar_days FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND procurements.sms_school_calendar_days.school_id IS NOT NULL
            AND u.school_id = procurements.sms_school_calendar_days.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "school_calendar_days_delete" ON procurements.sms_school_calendar_days;
CREATE POLICY "school_calendar_days_delete"
  ON procurements.sms_school_calendar_days FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND procurements.sms_school_calendar_days.school_id IS NOT NULL
            AND u.school_id = procurements.sms_school_calendar_days.school_id
          )
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_school_calendar_days TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_school_calendar_days_id_seq TO authenticated;
