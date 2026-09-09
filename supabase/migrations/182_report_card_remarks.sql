-- ============================================================================
-- REPORT CARD — TEACHER'S COMMENTS / REMARKS (Grades 2-10)
-- ============================================================================
-- The issued MATATAG card prints a TEACHER'S COMMENTS / REMARKS block with one
-- box per grading period, and until now the system had nowhere to type it: the
-- boxes printed empty for the adviser to fill in by hand. Every other band
-- already has its equivalent — Kindergarten in `sms_kinder_progress_remarks`
-- (172) and Grade 1 in `sms_grade1_progress_narratives` (180) — so this closes
-- the one gap, on the same shape as 172.
--
-- ITS OWN TABLE RATHER THAN A COLUMN ON `sms_report_card_core_values` (055).
-- That table is keyed (student_id, school_year) with no term and no section,
-- and its payload is the JSONB core-value ratings of the legacy 3-fold and
-- 2-fold cards — which the MATATAG card does not read at all, and says so on
-- screen ("Core values are not part of this form"). A per-term, per-section
-- field that only the MATATAG card prints has no business hanging off it.
--
-- THE TERM/QUARTER COUNT IS NOT FIXED AT THREE. `term` is CHECKed 1-4, not
-- 1-3: the card's period columns come from `getGradingPeriods(schoolYear)`, so
-- a term-based year (SY 2026-2027 onward, migration 173) prints three boxes
-- headed "Term" and an older year prints four headed "Quarter". Constraining
-- to three here would make a remark unstorable for the fourth quarter of a
-- year the card still prints a box for. The entry screen reads the same helper,
-- so the two cannot disagree about how many boxes exist.
--
-- SECTION-SCOPED, like 172's. The remark belongs to the learner in the class
-- the adviser advises; a learner who transfers section mid-year does not carry
-- the previous adviser's comment into the new one's card.
--
-- Writes are the ADVISER's — enforced in the app, on the same footing as Core
-- Values Entry, which is reachable only from the adviser's own section page.
-- RLS stays `authenticated` with app-layer scoping, matching 105/119/121/172/180:
-- widening or narrowing that is a decision for the whole module, not for one
-- text box.
--
-- Nothing existing is touched: one new table, no ALTER, no policy or trigger
-- replaced, no DML. A card printed before this is applied is unchanged, and a
-- learner with no remark prints the empty box exactly as today.
-- ============================================================================

SET search_path TO procurements, public;

CREATE TABLE IF NOT EXISTS procurements.sms_report_card_remarks (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL
    REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL
    REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  -- 1-3 on a term-based year, 1-4 on a quarter-based one. See the header.
  term SMALLINT NOT NULL CHECK (term BETWEEN 1 AND 4),
  remarks TEXT,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_report_card_remarks_uniq
    UNIQUE (student_id, section_id, school_year, term)
);

COMMENT ON TABLE procurements.sms_report_card_remarks IS
  'Adviser comments printed in the TEACHER''S COMMENTS / REMARKS block of the MATATAG report card / SF9, one per grading period.';
COMMENT ON COLUMN procurements.sms_report_card_remarks.term IS
  'Grading period: 1-3 on a term-based school year, 1-4 on a quarter-based one, following getGradingPeriods().';

CREATE INDEX IF NOT EXISTS idx_report_card_remarks_scope
  ON procurements.sms_report_card_remarks(section_id, school_year, term);
CREATE INDEX IF NOT EXISTS idx_report_card_remarks_student
  ON procurements.sms_report_card_remarks(student_id, school_year);

DROP TRIGGER IF EXISTS update_sms_report_card_remarks_updated_at
  ON procurements.sms_report_card_remarks;
CREATE TRIGGER update_sms_report_card_remarks_updated_at
  BEFORE UPDATE ON procurements.sms_report_card_remarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- RLS + GRANTS (app-layer scoping, per 105/119/121/172/180)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT := 'sms_report_card_remarks';
BEGIN
  EXECUTE format('ALTER TABLE procurements.%1$s ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('DROP POLICY IF EXISTS "%1$s: select" ON procurements.%1$s', t);
  EXECUTE format('DROP POLICY IF EXISTS "%1$s: insert" ON procurements.%1$s', t);
  EXECUTE format('DROP POLICY IF EXISTS "%1$s: update" ON procurements.%1$s', t);
  EXECUTE format('DROP POLICY IF EXISTS "%1$s: delete" ON procurements.%1$s', t);
  EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
  EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
  EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
  EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
END $$;
