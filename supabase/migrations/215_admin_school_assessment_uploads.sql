-- ============================================================================
-- Storage: let the school admin upload CRLA / Phil-IRI material files
--
-- The sidebar now offers Modules → Assessments (/school/assessments) to the
-- school `admin` as well as the school head (AppSidebar `hasStaffAccess`). The
-- material tables themselves are open to `authenticated` (106), so an admin can
-- already save a material — but 110's storage write policies on the
-- crla-materials/ and philiri-materials/ prefixes list only division_admin,
-- super admin, school_head and assistant_school_head, so attaching a task file
-- would fail with "new row violates row-level security policy".
--
-- Re-creates 110's six policies verbatim with `admin` added to the role list.
-- Read stays bucket-wide authenticated per 078. `type` is the active role (163),
-- so a teacher who also holds admin uploads only while switched to admin.
-- Six policies replaced; no table, column, trigger or DML.
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
  roles  TEXT := '''division_admin'', ''super admin'', ''school_head'', ''assistant_school_head'', ''admin''';
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
