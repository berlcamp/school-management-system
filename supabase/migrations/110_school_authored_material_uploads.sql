-- ============================================================================
-- Storage: let school heads upload CRLA / Phil-IRI material files
--
-- Migration 106 opened material authoring to schools (nullable school_id), and
-- the school Assessments pages reuse the same AddModal as the division office.
-- But the storage policies from 088 (crla-materials/) and 089 (philiri-
-- materials/) still restrict INSERT/UPDATE/DELETE to division_admin / super
-- admin, so a school head attaching a task file gets
-- "new row violates row-level security policy" on storage.objects.
--
-- Widen the write policies to the roles the sidebar admits to
-- /school/assessments (see AppSidebar `isSchoolHead`). Read stays bucket-wide
-- authenticated per migration 078, so advisers still download materials.
-- ============================================================================

DROP POLICY IF EXISTS "school_management crla insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management crla update" ON storage.objects;
DROP POLICY IF EXISTS "school_management crla delete" ON storage.objects;
DROP POLICY IF EXISTS "school_management philiri insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management philiri update" ON storage.objects;
DROP POLICY IF EXISTS "school_management philiri delete" ON storage.objects;

DO $$
DECLARE
  prefix TEXT;
  label  TEXT;
  roles  TEXT := '''division_admin'', ''super admin'', ''school_head'', ''assistant_school_head''';
BEGIN
  FOREACH prefix IN ARRAY ARRAY['crla-materials', 'philiri-materials'] LOOP
    label := split_part(prefix, '-', 1);

    EXECUTE format(
      'CREATE POLICY "school_management %1$s insert" ON storage.objects
         FOR INSERT TO authenticated
         WITH CHECK (
           bucket_id = ''school-management''
           AND split_part(name, ''/'', 1) = %2$L
           AND EXISTS (
             SELECT 1 FROM procurements.sms_users u
             WHERE u.user_id = auth.uid() AND u.type IN (%3$s)
           )
         )', label, prefix, roles);

    EXECUTE format(
      'CREATE POLICY "school_management %1$s update" ON storage.objects
         FOR UPDATE TO authenticated
         USING (
           bucket_id = ''school-management''
           AND split_part(name, ''/'', 1) = %2$L
           AND EXISTS (
             SELECT 1 FROM procurements.sms_users u
             WHERE u.user_id = auth.uid() AND u.type IN (%3$s)
           )
         )', label, prefix, roles);

    EXECUTE format(
      'CREATE POLICY "school_management %1$s delete" ON storage.objects
         FOR DELETE TO authenticated
         USING (
           bucket_id = ''school-management''
           AND split_part(name, ''/'', 1) = %2$L
           AND EXISTS (
             SELECT 1 FROM procurements.sms_users u
             WHERE u.user_id = auth.uid() AND u.type IN (%3$s)
           )
         )', label, prefix, roles);
  END LOOP;
END $$;
