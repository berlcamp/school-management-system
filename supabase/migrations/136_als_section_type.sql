-- ============================================================================
-- ALS SECTION TYPE + ALS SUBJECT / ALS SECTION PAIRING
-- ============================================================================
-- 1. Widens 008's section_type CHECK to admit 'als'.
-- 2. Enforces the pairing an ALS class actually has on paper: an ALS subject
--    (133's program = 'als') belongs in an ALS section and nowhere else, and an
--    ALS section carries ALS subjects and nothing else.
--
-- The rule is enforced on sms_subject_schedules because that is the only place
-- a subject is attached to a section — there is no section↔subject table. It is
-- a trigger rather than a CHECK because the two sides live in different tables.
--
-- Nothing existing can violate it: 'als' is not a legal section_type before
-- this migration, so no section is one, and no schedule row can already pair
-- the two wrongly. Existing rows are neither rewritten nor re-validated.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- WIDEN section_type
-- ============================================================================
-- Same constraint name and same drop-then-add shape as 008, so re-running is
-- safe. Nothing is normalised away this time: the set only grows.
ALTER TABLE procurements.sms_sections
  DROP CONSTRAINT IF EXISTS sms_sections_section_type_check;

ALTER TABLE procurements.sms_sections
  ADD CONSTRAINT sms_sections_section_type_check CHECK (
    section_type IS NULL OR section_type IN (
      'heterogeneous',
      'homogeneous_fast_learner',
      'homogeneous_crack_section',
      'homogeneous_random',
      'als'
    )
  );

COMMENT ON COLUMN procurements.sms_sections.section_type IS
  'Section type: heterogeneous, homogeneous_fast_learner, homogeneous_crack_section, homogeneous_random, or als. An als section may only be scheduled with subjects whose program is als (migration 136).';

-- ============================================================================
-- ALS SUBJECT ⟺ ALS SECTION
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.check_als_program_section_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_program      TEXT;
  v_subject      TEXT;
  v_section_type TEXT;
  v_section      TEXT;
BEGIN
  SELECT COALESCE(s.program, 'regular'), s.code || ' - ' || s.name
    INTO v_program, v_subject
    FROM procurements.sms_subjects s
   WHERE s.id = NEW.subject_id;

  SELECT sec.section_type, sec.name
    INTO v_section_type, v_section
    FROM procurements.sms_sections sec
   WHERE sec.id = NEW.section_id;

  -- Either side missing is not this trigger's business; the FKs cover it.
  IF v_program IS NULL OR v_section IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_program = 'als' AND COALESCE(v_section_type, '') <> 'als' THEN
    RAISE EXCEPTION
      'ALS subject "%" can only be scheduled in an ALS section; "%" is not one.',
      v_subject, v_section
      USING ERRCODE = '23514';
  END IF;

  IF v_program <> 'als' AND COALESCE(v_section_type, '') = 'als' THEN
    RAISE EXCEPTION
      'ALS section "%" can only be scheduled with ALS subjects; "%" is not one.',
      v_section, v_subject
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_als_program_section_match_trigger
  ON procurements.sms_subject_schedules;

CREATE TRIGGER check_als_program_section_match_trigger
  BEFORE INSERT OR UPDATE OF subject_id, section_id
  ON procurements.sms_subject_schedules
  FOR EACH ROW
  EXECUTE FUNCTION procurements.check_als_program_section_match();
