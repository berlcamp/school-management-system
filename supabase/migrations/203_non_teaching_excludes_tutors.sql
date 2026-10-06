-- =============================================================================
-- 203: Division Non-Teaching Personnel no longer counts ARAL tutors
-- =============================================================================
--
-- A pure ARAL tutor — a parent, volunteer or college student with no other
-- role — is created by the Add Tutor modal as an `sms_users` row of type
-- `tutor`, because that row is what lets them log in to the tutor workspace.
-- They are not on the plantilla. `division_non_teaching_summary` (071, 075)
-- counts every active user at a school whose type is not `teacher` and not a
-- division role, so each tutor landed in the report as "Other Non-Teaching".
--
-- A teacher or staff member who ALSO tutors keeps their own `type` (their tutor
-- access is the `is_tutor` flag AuthGuard derives from `sms_aral_tutors`), so
-- they are counted exactly as before. Only `type = 'tutor'` rows move.
-- App twin: `NON_STAFF_USER_TYPES` in lib/constants/userTypes.ts, which applies
-- the same exclusion to /staff, both dashboards, the Positions and Employee
-- Specialization reports and the teacher / adviser pickers.
--
-- WHY THIS PATCHES THE BODY INSTEAD OF RE-DECLARING THE FUNCTION
--   The live result type is not known with certainty: 075 re-created the
--   function with an extra `school_type` column, but the local clone (taken
--   from production) still has 071's five-column shape. A `CREATE OR REPLACE`
--   with the wrong RETURNS TABLE fails, and a DROP-and-recreate would change
--   the shape the report page reads (the 157 lesson). So this reads the live
--   definition, inserts `'tutor'` into its type exclusion, and re-executes it —
--   same signature, same result type, whichever shape is live. It raises
--   rather than guessing if the expected clause is not found.
--
-- Idempotent: a second run finds 'tutor' already excluded and does nothing.
--
-- ROWS TOUCHED: none. One function body replaced; no table, column, policy,
-- trigger or DML. The report's figures drop by the number of active tutors:
--
--   SELECT u.school_id, count(*) FROM procurements.sms_users u
--   WHERE u.type = 'tutor' AND u.is_active GROUP BY 1 ORDER BY 1;
-- =============================================================================

DO $$
DECLARE
  v_def TEXT;
  v_old CONSTANT TEXT :=
    $q$AND u.type NOT IN ('division_admin','division_type','super admin')$q$;
  v_new CONSTANT TEXT :=
    $q$AND u.type NOT IN ('division_admin','division_type','super admin','tutor')$q$;
BEGIN
  SELECT pg_get_functiondef(
           'procurements.division_non_teaching_summary()'::regprocedure)
    INTO v_def;

  IF position(v_new IN v_def) > 0 THEN
    RAISE NOTICE '203: division_non_teaching_summary already excludes tutors';
    RETURN;
  END IF;

  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION
      '203: expected type exclusion not found in division_non_teaching_summary; '
      'inspect it with pg_get_functiondef before applying';
  END IF;

  -- pg_get_functiondef emits CREATE OR REPLACE, so this keeps the signature,
  -- result type, SECURITY DEFINER, search_path and existing grants.
  EXECUTE replace(v_def, v_old, v_new);
END
$$;
