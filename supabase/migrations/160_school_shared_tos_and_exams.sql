-- ============================================================================
-- Migration 160: the school-wide tier for a TOS and an exam
-- ============================================================================
--
-- APPLY AFTER 096_table_of_specification and 099_exam_creator.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
--
-- 096 and 099 built exactly two tiers, and the second one is narrower than
-- anybody reading the module assumes:
--
--   school_id IS NULL -> DIVISION-authored, visible to every teacher
--   school_id set     -> TEACHER-authored, visible ONLY to created_by
--
-- The second is *private to one person*, not "the school's". The lists say so
-- (`.or(school_id.is.null,created_by.eq.<me>)`), which means a school head who
-- writes the school's own second-quarter TOS is the only human who can see it:
-- their teachers cannot open it, cannot build from it, and the school head
-- cannot hand it over except by re-typing it into each teacher's account.
-- Every school in the division sets its own periodical tests, so the missing
-- tier is the one they actually use.
--
-- This adds it as a flag on the existing school-scoped row rather than a third
-- value of `school_id`, because `school_id` already answers a different and
-- still-needed question — *which* school owns the row — and overloading it
-- would make "shared to school 12" and "private, at school 12" the same value.
--
--   school_id IS NULL                          -> division   (unchanged)
--   school_id set + is_school_shared = FALSE   -> private     (unchanged)
--   school_id set + is_school_shared = TRUE    -> school-wide (new)
--
-- ---------------------------------------------------------------------------
-- The default is load-bearing
-- ---------------------------------------------------------------------------
--
-- FALSE, so every row already authored keeps precisely the visibility it has
-- today and nobody's material becomes visible to their colleagues on apply.
-- The tier is opt-in, one row at a time, and clearing the flag reverts a row
-- exactly — this is the 153 `mapeh_component` rule.
--
-- A boolean is right here where 133 chose a CHECK-constrained TEXT: `program`
-- had three values that each carried *behaviour*, whereas this flag carries
-- none — it widens who may SELECT the row and nothing else. The third tier is
-- the pair (school_id, is_school_shared), which is already fully expressed.
--
-- ---------------------------------------------------------------------------
-- Visibility stays in the app layer
-- ---------------------------------------------------------------------------
--
-- RLS on sms_tos (096) and sms_exams (099) is permissive `authenticated` and is
-- NOT changed here: the tier decides what the lists show, exactly as the
-- existing two tiers do, and the sms_crla_* / sms_mps modules do the same. That
-- is a deliberate limit worth writing down — "private to the teacher" means the
-- UI does not list it, not that the database refuses to hand it over. Migration
-- 161 is where a real database-enforced gate arrives, and it guards the exam
-- PAPER (questions, choices, answer key), which is the part with a reason to be
-- confidential.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- Two ADD COLUMN IF NOT EXISTS with a FALSE default and one guard CHECK each.
-- No policy, trigger or function is touched and there is no DML. No existing
-- row can violate the CHECK, because the default it is being checked against is
-- the value every existing row gets. Idempotent; re-running is a no-op.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_tos
  ADD COLUMN IF NOT EXISTS is_school_shared BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE procurements.sms_exams
  ADD COLUMN IF NOT EXISTS is_school_shared BOOLEAN NOT NULL DEFAULT false;

-- A division row (school_id NULL) is already visible to everyone, so the flag
-- has no meaning there; forbidding the combination keeps a contradictory row
-- from ever being written and keeps the three tiers exhaustive.
ALTER TABLE procurements.sms_tos
  DROP CONSTRAINT IF EXISTS sms_tos_school_shared_needs_school;
ALTER TABLE procurements.sms_tos
  ADD CONSTRAINT sms_tos_school_shared_needs_school
  CHECK (school_id IS NOT NULL OR is_school_shared = false);

ALTER TABLE procurements.sms_exams
  DROP CONSTRAINT IF EXISTS sms_exams_school_shared_needs_school;
ALTER TABLE procurements.sms_exams
  ADD CONSTRAINT sms_exams_school_shared_needs_school
  CHECK (school_id IS NOT NULL OR is_school_shared = false);

COMMENT ON COLUMN procurements.sms_tos.is_school_shared IS
  'TRUE = shared to every teacher at school_id (school-wide tier, migration 160). FALSE = private to created_by. Meaningless when school_id IS NULL, which is the division tier; the CHECK forbids that combination.';
COMMENT ON COLUMN procurements.sms_exams.is_school_shared IS
  'TRUE = shared to every teacher at school_id (school-wide tier, migration 160). FALSE = private to created_by. Meaningless when school_id IS NULL, which is the division tier; the CHECK forbids that combination.';
