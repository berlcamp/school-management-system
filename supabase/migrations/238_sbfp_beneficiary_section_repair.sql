-- 238: SBFP beneficiaries saved under a section their learner is not enrolled in
--
-- Why
--   The Beneficiaries tab saves every ticked learner with the section currently
--   selected (lib/sbfp/queries.ts, saveSectionBeneficiaries). Its load had no
--   guard against an older, slower response, so switching sections quickly could
--   leave one section's learners on screen under another section's name, and a
--   Save then re-pointed their records at the wrong section. Seen at one school:
--   11 SNED learners saved under Kindergarten "Dove", which then read
--   "44 of 35 learners are beneficiaries" and printed those learners under
--   Kindergarten on the SBFP forms.
--
--   The app is fixed in the same change (stale loads are dropped, Save refuses a
--   learner not on the section's roster, and off-roster records are listed with
--   a Move button). This migration repairs the rows already written.
--
-- What it changes
--   sms_sbfp_beneficiaries.section_id only, and only where:
--     * the record's section is NOT a section the learner is enrolled in at the
--       programme's school and school year (approved enrolment, lifecycle status
--       active / completed / promoted / retained / graduated, the same rule as
--       ENROLLED_LIFECYCLE_STATUSES), and
--     * the learner is enrolled in exactly ONE such section, which becomes the
--       record's section.
--   Records of learners not enrolled at the school (left mid-programme) and any
--   ambiguous case are left as they are. Weighings and feeding records hang off
--   the beneficiary id, so they move with it. updated_at is bumped by 209's
--   trigger. Nothing is deleted.
--
-- Rows touched
--   Production, counted read-only through supabase-prod-ro before writing this:
--   11 rows, at 1 school. Re-run the count below just before applying; it must
--   return the number you expect (11), and 0 afterwards.
--
--   WITH enr AS (
--     SELECT b.id, b.section_id,
--            array_agg(DISTINCT e.section_id) FILTER (WHERE e.section_id IS NOT NULL) AS secs
--       FROM procurements.sms_sbfp_beneficiaries b
--       JOIN procurements.sms_sbfp_programs p ON p.id = b.program_id
--       LEFT JOIN procurements.sms_enrollments e
--         ON e.student_id = b.student_id AND e.school_id = p.school_id
--        AND e.school_year = p.school_year AND e.status = 'approved'
--        AND e.enrollment_status IN ('active','completed','promoted','retained','graduated')
--      GROUP BY b.id, b.section_id)
--   SELECT count(*) FROM enr
--    WHERE cardinality(secs) = 1
--      AND (section_id IS NULL OR section_id <> secs[1]);
--
-- Re-runnable: a second run finds nothing to change.
-- Tests: supabase/tests/238_sbfp_beneficiary_section_repair.sql

WITH enr AS (
  SELECT b.id,
         b.section_id,
         array_agg(DISTINCT e.section_id) FILTER (WHERE e.section_id IS NOT NULL) AS secs
    FROM procurements.sms_sbfp_beneficiaries b
    JOIN procurements.sms_sbfp_programs p ON p.id = b.program_id
    LEFT JOIN procurements.sms_enrollments e
      ON e.student_id = b.student_id
     AND e.school_id = p.school_id
     AND e.school_year = p.school_year
     AND e.status = 'approved'
     AND e.enrollment_status IN ('active', 'completed', 'promoted', 'retained', 'graduated')
   GROUP BY b.id, b.section_id
)
UPDATE procurements.sms_sbfp_beneficiaries b
   SET section_id = enr.secs[1]
  FROM enr
 WHERE b.id = enr.id
   AND cardinality(enr.secs) = 1
   AND (enr.section_id IS NULL OR enr.section_id <> enr.secs[1]);
