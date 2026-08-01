-- ============================================================================
-- LEARNER MANIFESTATION TAGGING (SNED referral pipeline)
-- ============================================================================
-- Implements the class-adviser side of the DepEd LIS "Tagging of Learners with
-- Special Educational Needs (SPED)" procedure — Division Memorandum No. 263,
-- s. 2024 (Kabankalan City), Enclosure No. 1, which itself operationalizes
-- DepEd Order No. 21, s. 2019 for Learners With Disabilities (LWDs).
--
-- The memo directs schools to tag LWDs in the LIS both WITH MANIFESTATIONS
-- (adviser-observed functional difficulty, no medical diagnosis yet) and WITH
-- MEDICAL DIAGNOSIS (confirmed by a licensed medical specialist). This module
-- is the school-side working record that FEEDS that LIS tagging — it does not
-- replace the LIS. `lis_tagged` records that the adviser has since mirrored the
-- tag into the LIS, which is the only place DepEd counts it.
--
-- THE PIPELINE (one row per learner per school year, in sms_manifestation_tags):
--
--   1. TAG        — adviser records one or more manifestations / diagnoses
--                   (sms_manifestation_tag_items) plus the class type. The
--                   non-graded branch of the LIS form asks for a program
--                   (Kinder / Primary Level I–III / Transition); the graded
--                   branch does not, hence non_graded_program is nullable.
--
--   2. CONSENT    — a parent/guardian consent form is printed and returned.
--                   The three options are exactly the ones on the DepEd SNED
--                   Parent/Guardian Consent Form: agree to LIS tagging AND
--                   medical assessment, agree to LIS tagging ONLY, or refuse
--                   (with a reason). 'pending' = form issued, not yet returned.
--
--   3. INTERVENTION — the adviser designs an intervention per tag
--                   (sms_manifestation_interventions).
--
--   4. TECHNICAL ASSISTANCE — the School Head may render TA on any intervention.
--                   TA lives on the intervention row (ta_notes / ta_by / ta_date)
--                   rather than in its own table because it is a response to one
--                   specific intervention, and there is at most one standing TA
--                   note per intervention (re-rendering TA overwrites it).
--
--   5. SNED       — learners that are tagged AND consented are IDENTIFIED for
--                   SNED enrollment. "Identified" is DERIVED, never stored:
--                   it is (has >= 1 tag item) AND (consent_status is an agree).
--                   Only the outcome — actual enrollment — is stored, because
--                   the system cannot infer it.
--
-- CONSENT IS NOT A GATE ON TAGGING. The adviser tags first and seeks consent
-- after (that is the order in the memo), so a tag with consent_status 'pending'
-- or even 'disagree' is a valid, expected state. A refusal is retained on the
-- record: the school still needs to show it sought consent.
--
-- SCOPE: rows carry school_id + school_year and are keyed on the STUDENT, so a
-- learner re-tagged next school year gets a new row and the previous year's
-- record (with its consent and interventions) stays intact. UNIQUE on
-- (student_id, school_year) — a learner has ONE tagging record per year, and
-- multiple manifestations hang off it as items.
--
-- RLS = authenticated, with roster scoping enforced in the app layer, matching
-- the sibling class-adviser tools in migration 105 (anecdotal / cardex).
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. TAGGING RECORD — one row per learner per school year
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_manifestation_tags (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,

  -- LIS branch: a graded class tags the classification only; a non-graded /
  -- SPED class additionally selects the program.
  class_type TEXT NOT NULL DEFAULT 'graded'
    CHECK (class_type IN ('graded', 'non_graded')),
  non_graded_program TEXT
    CHECK (non_graded_program IS NULL OR non_graded_program IN (
      'kinder', 'primary_1', 'primary_2', 'primary_3', 'transition'
    )),

  tagged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  observation TEXT,                   -- the OBSERVATION line on the consent form
  remarks TEXT,

  -- Parent/guardian consent (DepEd SNED Parent/Guardian Consent Form)
  consent_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (consent_status IN (
      'pending',                -- form issued, not yet returned
      'agree_lis_and_medical',  -- agrees to LIS tagging AND medical assessment
      'agree_lis_only',         -- agrees to LIS tagging only, no medical assessment
      'disagree'                -- refuses both
    )),
  consent_date DATE,                  -- date the signed form was returned
  consent_signatory TEXT,             -- printed name of the parent/guardian who signed
  consent_relationship TEXT,          -- relationship to the learner
  disagree_reason TEXT,               -- required by the form when refusing

  -- LIS mirror + SNED outcome
  lis_tagged BOOLEAN NOT NULL DEFAULT FALSE,
  lis_tagged_date DATE,
  sned_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  sned_enrolled_date DATE,

  created_by BIGINT REFERENCES procurements.sms_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_manifestation_tags_student_year_uniq
    UNIQUE (student_id, school_year)
);

COMMENT ON TABLE procurements.sms_manifestation_tags IS
  'Learner manifestation tagging: one row per learner per school year, carrying parent consent and the SNED enrollment outcome. Feeds the DepEd LIS SPED tagging.';
COMMENT ON COLUMN procurements.sms_manifestation_tags.lis_tagged IS
  'TRUE once the adviser has mirrored this tag into the DepEd LIS. The LIS remains the system of record for DepEd counts.';
COMMENT ON COLUMN procurements.sms_manifestation_tags.consent_status IS
  'pending until the signed form is returned. Tagging does NOT require consent — the adviser tags first, then seeks consent.';

CREATE INDEX IF NOT EXISTS idx_sms_manifestation_tags_scope
  ON procurements.sms_manifestation_tags(school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_sms_manifestation_tags_student
  ON procurements.sms_manifestation_tags(student_id, school_year);

CREATE TRIGGER update_sms_manifestation_tags_updated_at
  BEFORE UPDATE ON procurements.sms_manifestation_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. TAG ITEMS — the manifestation/s themselves ("tags learners with its
--    manifestation/s" — a learner may carry several)
--
--    `category` mirrors the three option groups of the LIS
--    "Classification/Type of Learner Special Educational Needs (LSEN)" select.
--    `code` is validated in the app against lib/constants/manifestation.ts
--    rather than by a CHECK constraint: DepEd revises the LSEN list between
--    memoranda, and a CHECK would turn each revision into a migration that
--    invalidates existing rows.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_manifestation_tag_items (
  id BIGSERIAL PRIMARY KEY,
  tag_id BIGINT NOT NULL REFERENCES procurements.sms_manifestation_tags(id) ON DELETE CASCADE,
  category TEXT NOT NULL
    CHECK (category IN ('gifted', 'diagnosed', 'manifestation')),
  code TEXT NOT NULL,                 -- LSEN code, see lib/constants/manifestation.ts
  notes TEXT,                         -- what the adviser actually observed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_manifestation_tag_items_uniq UNIQUE (tag_id, code)
);

COMMENT ON TABLE procurements.sms_manifestation_tag_items IS
  'One row per manifestation / diagnosis / giftedness carried by a tagged learner. Codes are app-validated (lib/constants/manifestation.ts), not CHECK-constrained, so DepEd list revisions do not invalidate history.';

CREATE INDEX IF NOT EXISTS idx_sms_manifestation_tag_items_tag
  ON procurements.sms_manifestation_tag_items(tag_id);

-- ----------------------------------------------------------------------------
-- 3. INTERVENTIONS — designed by the adviser, optionally given technical
--    assistance (TA) by the School Head
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_manifestation_interventions (
  id BIGSERIAL PRIMARY KEY,
  tag_id BIGINT NOT NULL REFERENCES procurements.sms_manifestation_tags(id) ON DELETE CASCADE,

  intervention_date DATE NOT NULL,
  focus_area TEXT,                    -- manifestation / need the plan addresses
  strategy TEXT NOT NULL,             -- the designed intervention itself
  resources TEXT,                     -- materials, personnel, referrals needed
  expected_outcome TEXT,
  progress TEXT,                      -- observed progress so far
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'ongoing', 'completed', 'discontinued')),

  -- Technical assistance rendered by the School Head on THIS intervention.
  ta_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ta_notes TEXT,
  ta_by BIGINT REFERENCES procurements.sms_users(id),
  ta_date DATE,

  created_by BIGINT REFERENCES procurements.sms_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_manifestation_interventions IS
  'Adviser-designed interventions for a tagged learner. ta_* columns hold the School Head technical assistance rendered on that intervention.';
COMMENT ON COLUMN procurements.sms_manifestation_interventions.ta_requested IS
  'Adviser flags an intervention as needing School Head technical assistance; the School Head answers by filling ta_notes / ta_by / ta_date.';

CREATE INDEX IF NOT EXISTS idx_sms_manifestation_interventions_tag
  ON procurements.sms_manifestation_interventions(tag_id);

CREATE TRIGGER update_sms_manifestation_interventions_updated_at
  BEFORE UPDATE ON procurements.sms_manifestation_interventions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. SNED COORDINATOR — signatory on the consent form
--
--    The DepEd SNED Parent/Guardian Consent Form is signed by the Class Adviser
--    and the SNED School Coordinator, and noted by the Principal. The first two
--    are already known (session user / principal settings from migration 053);
--    the coordinator is not, so it joins the same per-school settings row.
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_school_settings
  ADD COLUMN IF NOT EXISTS sned_coordinator_name TEXT DEFAULT NULL;

COMMENT ON COLUMN procurements.sms_school_settings.sned_coordinator_name IS
  'SNED School Coordinator; signatory on the printed SNED parent/guardian consent form.';

-- ----------------------------------------------------------------------------
-- RLS + GRANTS (roster scoping enforced in the app layer, per migration 105)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_manifestation_tags',
    'sms_manifestation_tag_items',
    'sms_manifestation_interventions'
  ] LOOP
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
  END LOOP;
END $$;
