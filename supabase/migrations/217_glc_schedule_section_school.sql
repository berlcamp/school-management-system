-- =============================================================================
-- 217 — Grade Level Coordinator branch: the section must be at the schedule's school
-- =============================================================================
--
-- 216's UPDATE policy on sms_subject_schedules admits a Grade Level Coordinator
-- through sms_glc_covers(school_id, <grade level of section_id>). The grade
-- level was looked up from ANY section, so the policy's implicit WITH CHECK
-- passed a new row whose section sat at another school, as long as that
-- section's grade level was covered.
--
-- A plain GLC could not exploit it (216's column guard lets them change only
-- the teacher), but a person who is both Department Head and GLC is exempt
-- from that guard for subjects they head, so they could move a headed
-- subject's schedule into another school's section of a covered grade. The
-- Department Head branch already requires the section to be at the schedule's
-- school; this gives the GLC branch the same condition.
--
-- The policy is re-created from 216 verbatim except one added line in the GLC
-- branch (AND sec.school_id = sms_subject_schedules.school_id). A section at
-- another school now yields a NULL grade level, and sms_glc_covers(..., NULL)
-- is false.
--
-- One policy replaced. No table, function, trigger or DML. Idempotent.
--
-- Before applying, optionally confirm production still carries 216's policy
-- (the qual should contain sms_glc_covers):
--
--   SELECT qual FROM pg_policies
--   WHERE schemaname = 'procurements' AND tablename = 'sms_subject_schedules'
--     AND policyname = 'Subject schedules are updatable by authorized roles';
-- =============================================================================

DROP POLICY IF EXISTS "Subject schedules are updatable by authorized roles" ON procurements.sms_subject_schedules;
CREATE POLICY "Subject schedules are updatable by authorized roles" ON procurements.sms_subject_schedules
  FOR UPDATE
  USING (
    (auth.role() = 'authenticated'::text) AND (
      (EXISTS ( SELECT 1
         FROM procurements.sms_users u
        WHERE ((u.user_id = auth.uid())
          AND (u.type = ANY (ARRAY['school_head'::text, 'assistant_school_head'::text, 'admin'::text, 'registrar'::text, 'division_admin'::text, 'super admin'::text]))
          AND ((u.type = ANY (ARRAY['division_admin'::text, 'super admin'::text])) OR (u.school_id = sms_subject_schedules.school_id)))))
      OR (procurements.sms_heads_subject(sms_subject_schedules.subject_id)
          AND sms_subject_schedules.school_id = (
            SELECT s.school_id FROM procurements.sms_subjects s
            WHERE s.id = sms_subject_schedules.subject_id)
          AND EXISTS (
            SELECT 1 FROM procurements.sms_sections sec
            WHERE sec.id = sms_subject_schedules.section_id
              AND sec.school_id = sms_subject_schedules.school_id))
      OR procurements.sms_glc_covers(
           sms_subject_schedules.school_id,
           (SELECT sec.grade_level::int FROM procurements.sms_sections sec
            WHERE sec.id = sms_subject_schedules.section_id
              AND sec.school_id = sms_subject_schedules.school_id))));
