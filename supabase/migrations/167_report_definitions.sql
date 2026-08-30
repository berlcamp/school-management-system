-- ============================================================================
-- 167. Saved report definitions
-- ============================================================================
--
-- WHY
-- ---
-- 166 lets a division user build a report. Without this, they build it again
-- from scratch every month: fourteen columns re-picked, four filters re-typed,
-- and a colleague who needs the same figures has to be talked through it over
-- the phone. A saved definition turns "the SDO monthly enrolment extract" from
-- a procedure somebody remembers into a row they click.
--
-- WHAT A DEFINITION IS
-- --------------------
-- The inputs to `division_report_run`, and nothing else: dataset, columns,
-- filters, sort. It is a saved *question*, never a saved answer — running it
-- next month gives next month's rows, which is the whole point. Nothing here
-- is a snapshot, so none of the 112/121/154 "reprint what was signed" rules
-- apply.
--
-- WHAT IS DELIBERATELY NOT STORED: THE SCHOOL YEAR
-- -----------------------------------------------
-- `school_id` is remembered — a report about one school is still about that
-- school next year — but the school year is not. A definition saved in
-- 2025-2026 and opened in 2026-2027 should default to the year the user is
-- working in; storing it would mean every saved report quietly reports last
-- year's figures until somebody noticed the dropdown. The builder therefore
-- seeds the school year from `getCurrentSchoolYear()` on load, every time.
--
-- SHARING — the 160 tiers, one axis shorter
-- ----------------------------------------
-- `is_division_shared` FALSE (the default) is private to its author; TRUE is
-- visible to the whole division office. There is no school tier: /division/*
-- is division-only (DivisionGuard), so a school tier would have no one in it.
-- **The FALSE default is load-bearing**, per the 153/160 rule — nothing becomes
-- visible to a colleague on apply, sharing is opt-in one row at a time, and
-- clearing the flag reverts exactly.
--
-- A shared definition is editable by its author **and** by division_admin /
-- super admin — 160's reasoning exactly: the division's own saved report has to
-- be fixable when its author is on leave. It is not editable by any other
-- colleague who merely happens to see it.
--
-- WHAT THIS TOUCHES
-- -----------------
-- Nothing. One new table, its policies and an updated_at trigger. No existing
-- table, column, policy, trigger or function is altered; no DML against live
-- data. Requires 166 (the dataset FK) and reuses `sms_current_user_row_id`
-- (134/163) and `update_updated_at_column` rather than re-declaring either.
--
-- ROWS AFFECTED: 0.
-- ============================================================================

CREATE TABLE IF NOT EXISTS procurements.sms_report_definitions (
  id                 BIGSERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT,
  dataset_key        TEXT NOT NULL,
  -- In the order they print. JSONB does not preserve key order, so this array
  -- is the only thing that knows it (166 §8).
  columns            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  filters            JSONB  NOT NULL DEFAULT '[]'::JSONB,
  sort_field         TEXT,
  sort_dir           TEXT,
  -- The remembered SCOPE, not an ownership tier: NULL = all schools.
  school_id          BIGINT,
  owner_id           BIGINT NOT NULL,
  is_division_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints added separately, per 116's lesson: CREATE TABLE IF NOT EXISTS
-- silently skips them when the table already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_report_definitions_dataset_fkey'
  ) THEN
    ALTER TABLE procurements.sms_report_definitions
      ADD CONSTRAINT sms_report_definitions_dataset_fkey
      FOREIGN KEY (dataset_key) REFERENCES procurements.sms_report_datasets(key)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_report_definitions_owner_fkey'
  ) THEN
    ALTER TABLE procurements.sms_report_definitions
      ADD CONSTRAINT sms_report_definitions_owner_fkey
      FOREIGN KEY (owner_id) REFERENCES procurements.sms_users(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_report_definitions_school_fkey'
  ) THEN
    ALTER TABLE procurements.sms_report_definitions
      ADD CONSTRAINT sms_report_definitions_school_fkey
      FOREIGN KEY (school_id) REFERENCES procurements.sms_schools(id)
      ON DELETE SET NULL;   -- 137's lesson: the delete rule is what bites
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_report_definitions_sort_dir_check'
  ) THEN
    ALTER TABLE procurements.sms_report_definitions
      ADD CONSTRAINT sms_report_definitions_sort_dir_check
      CHECK (sort_dir IS NULL OR sort_dir IN ('asc', 'desc'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_report_definitions_name_check'
  ) THEN
    ALTER TABLE procurements.sms_report_definitions
      ADD CONSTRAINT sms_report_definitions_name_check
      CHECK (btrim(name) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_report_definitions_filters_check'
  ) THEN
    ALTER TABLE procurements.sms_report_definitions
      ADD CONSTRAINT sms_report_definitions_filters_check
      CHECK (jsonb_typeof(filters) = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sms_report_definitions_owner_idx
  ON procurements.sms_report_definitions (owner_id);
CREATE INDEX IF NOT EXISTS sms_report_definitions_shared_idx
  ON procurements.sms_report_definitions (is_division_shared)
  WHERE is_division_shared;

COMMENT ON TABLE procurements.sms_report_definitions IS
  'Saved inputs to division_report_run (166): a saved question, never a saved '
  'answer. The school year is deliberately NOT stored — a report saved last '
  'year must open on this year — while school_id is the remembered scope.';

COMMENT ON COLUMN procurements.sms_report_definitions.is_division_shared IS
  'FALSE (default) = private to the author; TRUE = visible to the whole '
  'division office. The FALSE default is load-bearing: nothing becomes visible '
  'to a colleague on apply (the 153/160 rule).';

DROP TRIGGER IF EXISTS update_sms_report_definitions_updated_at
  ON procurements.sms_report_definitions;
CREATE TRIGGER update_sms_report_definitions_updated_at
  BEFORE UPDATE ON procurements.sms_report_definitions
  FOR EACH ROW EXECUTE FUNCTION procurements.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Who may edit a shared definition — 160's rule, in one place
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.can_manage_report_definition(
  p_owner_id BIGINT,
  p_is_shared BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT
    -- The author, always.
    p_owner_id = procurements.sms_current_user_row_id()
    -- A shared definition is the division's, so the division office may fix it
    -- when its author is on leave (160). `type` is the ACTIVE role (invariant 12).
    OR (
      COALESCE(p_is_shared, FALSE)
      AND EXISTS (
        SELECT 1 FROM procurements.sms_users u
        WHERE u.user_id = auth.uid()
          AND u.type IN ('division_admin', 'super admin')
      )
    );
$$;

COMMENT ON FUNCTION procurements.can_manage_report_definition(BIGINT, BOOLEAN) IS
  'Saved reports (167): the author may always edit; a division-shared one may '
  'also be edited by division_admin / super admin, per the 160 precedent.';

GRANT EXECUTE ON FUNCTION
  procurements.can_manage_report_definition(BIGINT, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE procurements.sms_report_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Report definitions are viewable by owner or division"
  ON procurements.sms_report_definitions;
CREATE POLICY "Report definitions are viewable by owner or division"
  ON procurements.sms_report_definitions
  FOR SELECT TO authenticated
  USING (
    owner_id = procurements.sms_current_user_row_id()
    OR is_division_shared
  );

-- The author is written from auth.uid(), never taken from the client: a row
-- saved as somebody else would let one user put a report in another's list.
DROP POLICY IF EXISTS "Report definitions are insertable by their author"
  ON procurements.sms_report_definitions;
CREATE POLICY "Report definitions are insertable by their author"
  ON procurements.sms_report_definitions
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = procurements.sms_current_user_row_id());

DROP POLICY IF EXISTS "Report definitions are updatable by their manager"
  ON procurements.sms_report_definitions;
CREATE POLICY "Report definitions are updatable by their manager"
  ON procurements.sms_report_definitions
  FOR UPDATE TO authenticated
  USING (procurements.can_manage_report_definition(owner_id, is_division_shared))
  -- The author cannot be reassigned by an update.
  WITH CHECK (
    procurements.can_manage_report_definition(owner_id, is_division_shared)
  );

DROP POLICY IF EXISTS "Report definitions are deletable by their manager"
  ON procurements.sms_report_definitions;
CREATE POLICY "Report definitions are deletable by their manager"
  ON procurements.sms_report_definitions
  FOR DELETE TO authenticated
  USING (procurements.can_manage_report_definition(owner_id, is_division_shared));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_report_definitions TO authenticated;
GRANT USAGE, SELECT
  ON SEQUENCE procurements.sms_report_definitions_id_seq TO authenticated;
