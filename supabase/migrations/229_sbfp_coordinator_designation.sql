-- =============================================================================
-- 229 — SBFP Coordinator designation
-- =============================================================================
--
-- A fifth staff designation (216), handed out at /staff: `sbfp_coordinator`
-- opens the School-Based Feeding Program to its holder at the school it was
-- granted for, whatever role they act as. A designation, not a role: no
-- `sms_users.type` moves (invariant 19).
--
-- The rights are the focal person's (209). The two share every branch that
-- `sbfp_can_manage` feeds: the whole programme's beneficiaries, weighings,
-- feeding records, deliveries, contacts, logs and feedback.
-- Also like the focal person, a coordinator may NOT delete a programme or
-- change the focal person: `sbfp_can_manage_school` is deliberately untouched.
-- Unlike the focal person, they may open the school's programme for the year
-- (`sbfp_can_open`), since a focal person exists only once a programme does.
--
-- `sms_has_designation` tests the ACTIVE school (invariant 13), so switched to
-- another school the designation stops counting.
--
-- BEFORE APPLYING: both function bodies below are the current ones from the
-- local clone plus one branch each. Compare with production first, and stop if
-- production carries a branch this file lacks:
--   SELECT pg_get_functiondef('procurements.sbfp_can_manage(bigint)'::regprocedure);
--   SELECT pg_get_functiondef('procurements.sbfp_can_open(bigint)'::regprocedure);
--
-- One CHECK replaced (widened, so every existing row still passes), two
-- functions replaced with the same signatures. No table, policy or trigger
-- touched, no DML: nobody holds the designation until a school hands it out.
-- Idempotent. Tests: supabase/tests/229_sbfp_coordinator.sql
-- =============================================================================

ALTER TABLE procurements.sms_staff_designations
  DROP CONSTRAINT IF EXISTS sms_staff_designations_designation_check;
ALTER TABLE procurements.sms_staff_designations
  ADD CONSTRAINT sms_staff_designations_designation_check CHECK (designation IN (
    'aral_coordinator', 'reading_coordinator', 'department_head',
    'grade_level_coordinator', 'sbfp_coordinator'));

CREATE OR REPLACE FUNCTION procurements.sbfp_can_manage(p_program_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM procurements.sms_sbfp_programs p
      JOIN procurements.sms_users u ON u.user_id = auth.uid()
     WHERE p.id = p_program_id
       AND u.is_active
       AND (
         u.type = 'super admin'
         OR (
           u.school_id = p.school_id
           AND (
             u.type IN ('school_head', 'assistant_school_head', 'admin', 'school_nurse')
             OR u.id = p.focal_person_id
             OR procurements.sms_has_designation('sbfp_coordinator', p.school_id)
           )
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION procurements.sbfp_can_open(p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT procurements.sbfp_can_manage_school(p_school_id)
      OR procurements.sbfp_is_school_teacher(p_school_id)
      OR procurements.sms_has_designation('sbfp_coordinator', p_school_id);
$$;
