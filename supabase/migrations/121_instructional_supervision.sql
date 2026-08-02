-- ============================================================================
-- INSTRUCTIONAL SUPERVISION (Supervisory Plan + COT / PMES classroom observation)
-- ============================================================================
-- Implements the school's instructional supervision cycle as it is actually
-- run on paper today:
--
--   1. PLAN        — the School Head writes an INSTRUCTIONAL SUPERVISORY PLAN
--                    per term (SY is split into Term 1 Jun-Aug, Term 2 Sep-Nov,
--                    Term 3 Jan-Mar). Each row of that matrix names the
--                    teacher/s, the priority KRA and strand, the objective, the
--                    enabling activity, the success indicator, the means of
--                    verification, the time frame, and the STAR remark.
--                    → sms_supervision_plans / sms_supervision_plan_entries
--
--   2. SCHEDULE    — teachers (and the School Head) SUGGEST an observation
--                    schedule using the per-teacher supervisory plan slip:
--                    position, rated / non-rated, term, grade & section, date
--                    and time of pre-conference, date and time of the actual
--                    observation, focus KRA, focus indicator, ILAW lesson plan.
--                    The School Head approves or rejects. Only once APPROVED is
--                    the schedule exportable to a calendar.
--                    → sms_supervision_schedules
--
--                    Calendar export is a client-side "Add to Google Calendar"
--                    link plus a downloadable .ics — no OAuth, no stored Google
--                    tokens. `calendar_exported_at` only records that somebody
--                    took the export, so the board can show what still needs to
--                    be put on a calendar; it is a convenience flag, never a
--                    guarantee that the event exists on anyone's calendar.
--
--   3. OBSERVE     — during the actual observation each observer fills a COT
--                    RATING SHEET (Annex E-2) and may keep OBSERVATION NOTES
--                    (Annex E-4). Where a school fields more than one observer,
--                    they meet afterwards and agree on a single FINAL rating per
--                    indicator on the INTER-OBSERVER AGREEMENT FORM (Annex E-3).
--                    → sms_cot_observations / sms_cot_ratings
--
-- THE OBSERVER IS NOT NECESSARILY THE SCHOOL HEAD. Master teachers routinely
-- observe. Who may observe is a per-school-year designation made by the School
-- Head (sms_supervision_observers) rather than a role check, because the pool
-- differs by school and DepEd does not tie it to a plantilla position.
--
-- ── WHAT THE COT FORMS ACTUALLY VARY BY ─────────────────────────────────────
-- Two independent axes, and getting them confused is the classic error:
--
--   * CAREER STAGE fixes the RATING SCALE only. The indicator TEXT is written
--     in Proficient Teacher language for everyone; only the levels shift —
--     Teacher I-III use 2-6, Teacher IV-VII 3-7, Master Teacher I-II 4-8, and
--     Master Teacher III-V 5-9. "Not Observed" is not a zero: it automatically
--     scores the LOWEST level of that stage (2 / 3 / 4 / 5 respectively).
--
--   * SCHOOL YEAR fixes WHICH INDICATORS appear. The PMES rotates a 9/9/8
--     indicator set on a three-year cycle (SY 2025-2026, 2026-2027, 2027-2028,
--     then repeating). Every career stage in a given SY rates the SAME list.
--
-- Both are therefore stored ON THE OBSERVATION ROW (career_stage, form_cycle_sy)
-- and never re-derived at print time: a teacher promoted from Teacher III to
-- Teacher IV mid-year must not retroactively change the scale of an observation
-- already signed on paper. Indicator codes are stored as free TEXT and resolved
-- against lib/constants/supervision.ts, per the 119 precedent — DepEd revises
-- the PPST indicator set between memoranda and a CHECK constraint would turn
-- each revision into a migration that invalidates history.
--
-- RLS = authenticated with app-layer scoping, matching 105 / 119.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. DESIGNATED OBSERVERS — who may rate a COT, per school year
--
--    A designation, not a role: the School Head names master teachers, the
--    assistant school head, department heads — whoever actually observes.
--    Deactivating (is_active = FALSE) rather than deleting keeps the audit
--    trail for observations they already signed.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_supervision_observers (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  designated_by BIGINT REFERENCES procurements.sms_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_supervision_observers_uniq UNIQUE (school_id, school_year, user_id)
);

COMMENT ON TABLE procurements.sms_supervision_observers IS
  'Staff designated by the School Head as classroom observers for a school year. The observer need not be the School Head — master teachers routinely observe.';

CREATE INDEX IF NOT EXISTS idx_sms_supervision_observers_scope
  ON procurements.sms_supervision_observers(school_id, school_year);

CREATE TRIGGER update_sms_supervision_observers_updated_at
  BEFORE UPDATE ON procurements.sms_supervision_observers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. INSTRUCTIONAL SUPERVISORY PLAN — one per (school, school year, term)
--
--    The printed document is one matrix per term with a "Prepared by" block.
--    prepared_by_name / prepared_by_position are SNAPSHOT strings rather than a
--    join to sms_users: the signed plan carries the name and designation as of
--    signing, and a later rename or promotion must not rewrite a filed plan.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_supervision_plans (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  term SMALLINT NOT NULL CHECK (term BETWEEN 1 AND 3),

  prepared_by BIGINT REFERENCES procurements.sms_users(id),
  prepared_by_name TEXT,
  prepared_by_position TEXT,

  created_by BIGINT REFERENCES procurements.sms_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_supervision_plans_uniq UNIQUE (school_id, school_year, term)
);

COMMENT ON TABLE procurements.sms_supervision_plans IS
  'School Head Instructional Supervisory Plan, one per term (T1 Jun-Aug, T2 Sep-Nov, T3 Jan-Mar).';
COMMENT ON COLUMN procurements.sms_supervision_plans.prepared_by_name IS
  'Snapshot of the signatory name at the time the plan was written; not re-derived from sms_users.';

CREATE INDEX IF NOT EXISTS idx_sms_supervision_plans_scope
  ON procurements.sms_supervision_plans(school_id, school_year);

CREATE TRIGGER update_sms_supervision_plans_updated_at
  BEFORE UPDATE ON procurements.sms_supervision_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. PLAN ENTRIES — the rows of that matrix
--
--    `teachers` is free TEXT, matching the source document: a single row
--    routinely covers a named list ("Jessa Lyka F. Savandal, Teresa M. Ruaya,
--    ...") or a whole group ("All Primary Grade Teachers", "All Teachers divided
--    by clusters"). Forcing it into a join table would make the second form
--    unrepresentable. teacher_ids is an OPTIONAL parallel list, used only to
--    offer those teachers when generating schedules from the plan.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_supervision_plan_entries (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES procurements.sms_supervision_plans(id) ON DELETE CASCADE,

  teachers TEXT NOT NULL,                 -- "Name of Teachers / Learning Area / Level"
  teacher_ids BIGINT[] NOT NULL DEFAULT '{}',
  kra TEXT,                               -- Key Result Area (Priority Strand)
  priority_strand TEXT,                   -- the PPST strand under that KRA
  objectives TEXT,
  activities TEXT,                        -- Enabling Projects and/or Activities
  success_indicators TEXT,
  means_of_verification TEXT,
  time_frame TEXT,                        -- free text: the source has "TBA" rows
  accomplishment TEXT,                    -- Accomplishment / Status
  remarks TEXT,                           -- Remarks (STAR Approach)
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN procurements.sms_supervision_plan_entries.teachers IS
  'Free text by design — a plan row may name individuals or a whole group ("All Primary Grade Teachers").';
COMMENT ON COLUMN procurements.sms_supervision_plan_entries.remarks IS
  'Remarks written with the STAR approach (Situation, Task, Action, Result).';

CREATE INDEX IF NOT EXISTS idx_sms_supervision_plan_entries_plan
  ON procurements.sms_supervision_plan_entries(plan_id, sort_order);

CREATE TRIGGER update_sms_supervision_plan_entries_updated_at
  BEFORE UPDATE ON procurements.sms_supervision_plan_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. OBSERVATION SCHEDULES — the per-teacher supervisory plan slip
--
--    Proposed by the teacher OR by the School Head (proposed_by tells which),
--    then approved / rejected. Rescheduling is an UPDATE that returns the row to
--    'proposed'; the previous decision fields are cleared by the app so an
--    approved-then-moved slot cannot masquerade as still approved.
--
--    career_stage is captured HERE, at scheduling time, because it selects which
--    COT rating scale the observers will use and the School Head confirms it
--    when approving. It is copied onto each observation row on creation.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_supervision_schedules (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  term SMALLINT NOT NULL CHECK (term BETWEEN 1 AND 3),

  teacher_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  teacher_position TEXT,                  -- snapshot of the plantilla position
  career_stage TEXT NOT NULL DEFAULT 'proficient_a'
    CHECK (career_stage IN (
      'proficient_a',        -- Teacher I-III,        levels 2-6
      'proficient_b',        -- Teacher IV-VII,       levels 3-7
      'highly_proficient',   -- Master Teacher I-II,  levels 4-8
      'distinguished'        -- Master Teacher III-V, levels 5-9
    )),

  -- "Type of Instructional Supervision: Rated / Non-rated". A non-rated
  -- (fleeting) observation still gets notes but no COT rating sheet.
  supervision_type TEXT NOT NULL DEFAULT 'rated'
    CHECK (supervision_type IN ('rated', 'non_rated')),
  observation_round SMALLINT NOT NULL DEFAULT 1 CHECK (observation_round IN (1, 2)),
  quarter SMALLINT CHECK (quarter IS NULL OR quarter BETWEEN 1 AND 4),

  section_id BIGINT REFERENCES procurements.sms_sections(id) ON DELETE SET NULL,
  subject_id BIGINT REFERENCES procurements.sms_subjects(id) ON DELETE SET NULL,
  -- Printed on the COT as "SUBJECT & GRADE LEVEL TAUGHT". Kept as text so a
  -- filed form still prints correctly after a section or subject is renamed
  -- or deleted, and so classes outside sms_subjects can be scheduled.
  class_label TEXT,

  pre_conference_at TIMESTAMPTZ,
  observation_at TIMESTAMPTZ NOT NULL,
  observation_end_at TIMESTAMPTZ,

  focus_kra TEXT,
  focus_indicator TEXT,                   -- PPST indicator code, e.g. '1.1.2'
  lesson_plan_url TEXT,                   -- attached ILAW lesson plan
  notes TEXT,

  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'completed', 'cancelled')),
  proposed_by BIGINT REFERENCES procurements.sms_users(id),
  decided_by BIGINT REFERENCES procurements.sms_users(id),
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,

  -- Set when someone takes the calendar export (link or .ics). Advisory only.
  calendar_exported_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_supervision_schedules_window
    CHECK (observation_end_at IS NULL OR observation_end_at > observation_at)
);

COMMENT ON TABLE procurements.sms_supervision_schedules IS
  'Suggested / approved classroom observation slots. Only approved schedules are exportable to a calendar.';
COMMENT ON COLUMN procurements.sms_supervision_schedules.career_stage IS
  'Fixes the COT rating scale only (2-6 / 3-7 / 4-8 / 5-9). The indicator text is identical across stages.';
COMMENT ON COLUMN procurements.sms_supervision_schedules.supervision_type IS
  'non_rated = fleeting observation: notes are kept, no COT rating sheet is produced.';
COMMENT ON COLUMN procurements.sms_supervision_schedules.calendar_exported_at IS
  'Advisory flag: someone downloaded the .ics / opened the Add-to-Calendar link. Not proof the event exists on any calendar.';

CREATE INDEX IF NOT EXISTS idx_sms_supervision_schedules_scope
  ON procurements.sms_supervision_schedules(school_id, school_year, term);
CREATE INDEX IF NOT EXISTS idx_sms_supervision_schedules_teacher
  ON procurements.sms_supervision_schedules(teacher_id, school_year);
CREATE INDEX IF NOT EXISTS idx_sms_supervision_schedules_status
  ON procurements.sms_supervision_schedules(school_id, status, observation_at);

CREATE TRIGGER update_sms_supervision_schedules_updated_at
  BEFORE UPDATE ON procurements.sms_supervision_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. SCHEDULE OBSERVERS — who is assigned to observe this slot
--
--    The Inter-Observer Agreement Form prints three observer signature lines, so
--    `slot` is constrained to 1-3 and drives which line an observer signs. One
--    observer is the normal case ("For schools with only one observer, this form
--    will serve as the final rating sheet") — the E-3 is only produced when a
--    slot has more than one.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_supervision_schedule_observers (
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT NOT NULL
    REFERENCES procurements.sms_supervision_schedules(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  slot SMALLINT NOT NULL DEFAULT 1 CHECK (slot BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_supervision_schedule_observers_uniq UNIQUE (schedule_id, user_id),
  CONSTRAINT sms_supervision_schedule_observers_slot_uniq UNIQUE (schedule_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_sms_supervision_schedule_observers_schedule
  ON procurements.sms_supervision_schedule_observers(schedule_id);
CREATE INDEX IF NOT EXISTS idx_sms_supervision_schedule_observers_user
  ON procurements.sms_supervision_schedule_observers(user_id);

-- ----------------------------------------------------------------------------
-- 6. COT OBSERVATIONS — one row per filled form
--
--    kind:
--      'rating'    Annex E-2 COT Rating Sheet          — one per observer
--      'agreement' Annex E-3 Inter-Observer Agreement  — one per schedule, the
--                  reasoned CONSENSUS rating (explicitly NOT an average)
--      'notes'     Annex E-4 COT Observation Notes     — one per observer
--
--    form_cycle_sy names the school year whose indicator SET this form uses. It
--    is normally the schedule's school year, but is stored separately and
--    explicitly so a form filed under a superseded set keeps printing its own
--    indicators when the 3-year cycle rolls over.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_cot_observations (
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT NOT NULL
    REFERENCES procurements.sms_supervision_schedules(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN ('rating', 'agreement', 'notes')),
  -- NULL only for 'agreement', which is the observers' joint output.
  observer_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  observer_name TEXT,                     -- snapshot for the signature line

  career_stage TEXT NOT NULL
    CHECK (career_stage IN (
      'proficient_a', 'proficient_b', 'highly_proficient', 'distinguished'
    )),
  form_cycle_sy TEXT NOT NULL,            -- which indicator set this form uses

  observation_date DATE,
  time_started TEXT,                      -- printed verbatim ("8:20 a.m.")
  time_ended TEXT,
  quarter SMALLINT CHECK (quarter IS NULL OR quarter BETWEEN 1 AND 4),
  observation_round SMALLINT NOT NULL DEFAULT 1 CHECK (observation_round IN (1, 2)),
  class_label TEXT,                       -- "SUBJECT & GRADE LEVEL TAUGHT"

  comments TEXT,                          -- "OTHER COMMENTS" (E-2 / E-3)
  notes TEXT,                             -- free-form narrative (E-4)

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted')),
  submitted_at TIMESTAMPTZ,

  created_by BIGINT REFERENCES procurements.sms_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_cot_observations_observer_required
    CHECK (kind = 'agreement' OR observer_id IS NOT NULL)
);

COMMENT ON TABLE procurements.sms_cot_observations IS
  'One filled COT form: E-2 rating sheet (per observer), E-3 inter-observer agreement (per schedule), or E-4 observation notes.';
COMMENT ON COLUMN procurements.sms_cot_observations.form_cycle_sy IS
  'School year whose PMES indicator set this form uses. Stored, never re-derived: the set rotates on a 3-year cycle.';
COMMENT ON COLUMN procurements.sms_cot_observations.career_stage IS
  'Copied from the schedule at creation. A later promotion must not change the scale of an already-signed form.';

-- One rating sheet and one notes form per observer per schedule; one agreement
-- per schedule. Partial indexes because the rule differs per kind, and because
-- observer_id is NULL on agreements (a plain UNIQUE would not constrain them).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_cot_observations_rating_uniq
  ON procurements.sms_cot_observations(schedule_id, observer_id)
  WHERE kind = 'rating';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_cot_observations_notes_uniq
  ON procurements.sms_cot_observations(schedule_id, observer_id)
  WHERE kind = 'notes';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_cot_observations_agreement_uniq
  ON procurements.sms_cot_observations(schedule_id)
  WHERE kind = 'agreement';

CREATE INDEX IF NOT EXISTS idx_sms_cot_observations_schedule
  ON procurements.sms_cot_observations(schedule_id);
CREATE INDEX IF NOT EXISTS idx_sms_cot_observations_observer
  ON procurements.sms_cot_observations(observer_id);

CREATE TRIGGER update_sms_cot_observations_updated_at
  BEFORE UPDATE ON procurements.sms_cot_observations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 7. COT RATINGS — one row per indicator on a rating sheet / agreement form
--
--    `rating` is nullable and DELIBERATELY unconstrained in range: the legal
--    band depends on the career stage on the parent row (2-6 / 3-7 / 4-8 / 5-9),
--    which a per-row CHECK cannot see. The app enforces the band from
--    lib/constants/supervision.ts, which is also the only place the bands are
--    written down.
--
--    The three states are mutually exclusive and all meaningful:
--      rating set              — observed and scored
--      not_observed = TRUE     — "NO": automatically scores the LOWEST level of
--                                the stage, so `rating` is stored as that level
--                                too, and the printed form marks the NO column
--      not_applicable = TRUE   — "N/A": excluded from the form entirely, no score
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_cot_ratings (
  id BIGSERIAL PRIMARY KEY,
  observation_id BIGINT NOT NULL
    REFERENCES procurements.sms_cot_observations(id) ON DELETE CASCADE,
  indicator_code TEXT NOT NULL,           -- e.g. '1.1.2'; see lib/constants/supervision.ts
  rating SMALLINT,
  not_observed BOOLEAN NOT NULL DEFAULT FALSE,
  not_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_cot_ratings_uniq UNIQUE (observation_id, indicator_code),
  CONSTRAINT sms_cot_ratings_exclusive
    CHECK (NOT (not_observed AND not_applicable))
);

COMMENT ON COLUMN procurements.sms_cot_ratings.rating IS
  'Range depends on the parent observation career_stage (2-6 / 3-7 / 4-8 / 5-9) and is enforced in the app, not by a CHECK.';
COMMENT ON COLUMN procurements.sms_cot_ratings.not_observed IS
  'The COT "NO" column. Not a zero: it scores the lowest level of the career stage, which is also written to `rating`.';

CREATE INDEX IF NOT EXISTS idx_sms_cot_ratings_observation
  ON procurements.sms_cot_ratings(observation_id);

CREATE TRIGGER update_sms_cot_ratings_updated_at
  BEFORE UPDATE ON procurements.sms_cot_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- RLS + GRANTS (roster / school scoping enforced in the app layer, per 105/119)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_supervision_observers',
    'sms_supervision_plans',
    'sms_supervision_plan_entries',
    'sms_supervision_schedules',
    'sms_supervision_schedule_observers',
    'sms_cot_observations',
    'sms_cot_ratings'
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
