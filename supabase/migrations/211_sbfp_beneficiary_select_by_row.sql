-- ============================================================================
-- 211: SBFP beneficiaries can be saved again
-- ============================================================================
-- After 210, saving the Beneficiaries tab failed for every user with
--   new row violates row-level security policy for table "sms_sbfp_beneficiaries"
--
-- The app saves with an upsert (INSERT ... ON CONFLICT DO UPDATE). Postgres
-- checks the NEW row of an upsert against the table's SELECT policy as well as
-- its INSERT policy. 210's SELECT policy was sbfp_can_view_beneficiary(id),
-- which looks the row up by id; a row being inserted is not in the table yet,
-- so the lookup found nothing and the check failed. 210's test used plain
-- INSERTs, which do not consult the SELECT policy, so it did not catch this.
--
-- Fix: the beneficiaries SELECT policy decides from the row's own columns
-- (program_id, created_by) instead of looking the row up. The rule is the same
-- as 210's: managers and the read-all roles see every row; a teacher sees the
-- rows they encoded while at that school. created_by is stamped by 210's
-- BEFORE INSERT trigger, so a new row already carries its owner when checked.
--
-- sbfp_can_view_beneficiary(id) is kept: weighings and feeding records still
-- use it, and their parent row always exists.
--
-- One new function, one policy replaced. No table, column or DML.
-- ============================================================================

SET search_path TO procurements, public;

CREATE OR REPLACE FUNCTION procurements.sbfp_can_view_beneficiary_row(
  p_program_id BIGINT,
  p_created_by BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT procurements.sbfp_can_view_all(p_program_id)
      OR EXISTS (
        SELECT 1
          FROM procurements.sms_sbfp_programs p
          JOIN procurements.sms_users u ON u.user_id = auth.uid()
         WHERE p.id = p_program_id
           AND u.is_active
           AND u.id = p_created_by
           AND u.school_id = p.school_id
      );
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_can_view_beneficiary_row(BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_view_beneficiary_row(BIGINT, BIGINT) TO authenticated;

DROP POLICY IF EXISTS "sbfp_beneficiaries_select" ON procurements.sms_sbfp_beneficiaries;
CREATE POLICY "sbfp_beneficiaries_select" ON procurements.sms_sbfp_beneficiaries
  FOR SELECT TO authenticated
  USING (procurements.sbfp_can_view_beneficiary_row(program_id, created_by));

-- Verification: expect one row, policy_uses_row_check = true.
SELECT policyname,
       qual LIKE '%sbfp_can_view_beneficiary_row%' AS policy_uses_row_check
  FROM pg_policies
 WHERE schemaname = 'procurements'
   AND tablename = 'sms_sbfp_beneficiaries'
   AND policyname = 'sbfp_beneficiaries_select';
