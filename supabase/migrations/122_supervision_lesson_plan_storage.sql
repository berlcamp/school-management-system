-- ============================================================================
-- STORAGE: ILAW lesson plan attachments for observation schedules
-- ============================================================================
-- The per-teacher supervisory plan slip ends with "Attach ILAW Lesson Plan".
-- Migration 121 modelled that as a link (`lesson_plan_url`), which pushed the
-- actual document out to whatever Drive folder the teacher happened to use.
-- This migration makes it a real attachment.
--
-- Files live under the `supervision-lesson-plans/` prefix of the existing
-- `school-management` bucket, following the crla-materials / philiri-materials
-- convention from 088 / 089 / 110.
--
-- ⚠ PRIVACY NOTE: `school-management` is a PUBLIC bucket (078 sets
-- `public = true`) so that landing-page hero images resolve without auth. That
-- means any object in it — including a lesson plan — is readable by anyone who
-- has the object URL, with no sign-in. The uuid in the path makes the URL
-- unguessable, but this is obscurity, not access control. If lesson plans ever
-- need to be genuinely restricted, they must move to a private bucket (see the
-- `diplomas` pattern in 026); flipping this bucket to private would break the
-- public hero images that depend on it.
--
-- Object path layout:
--   supervision-lesson-plans/<school_id>/<school_year>/<uuid>-<filename>
-- The uuid prefix means a file can be uploaded BEFORE its schedule row exists
-- (the modal uploads on pick, so the teacher sees the attachment land before
-- submitting) and two teachers uploading "ILAW.docx" never collide.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Write policies for the new prefix
--
--    078 grants bucket-wide SELECT to authenticated, so reads already work.
--    Its INSERT/UPDATE/DELETE policies, however, are scoped to `landing-hero/`
--    only — without the policies below every upload fails with
--    "new row violates row-level security policy".
--
--    Roles: the School Head side (/supervision) plus teachers, who propose
--    their own observation slots from /teacher/supervision and attach their own
--    lesson plan. Master teachers carry type 'teacher'; their observer status is
--    a designation (sms_supervision_observers), not a user type.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "school_management supervision insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management supervision update" ON storage.objects;
DROP POLICY IF EXISTS "school_management supervision delete" ON storage.objects;

DO $$
DECLARE
  prefix TEXT := 'supervision-lesson-plans';
  roles  TEXT := '''teacher'', ''school_head'', ''assistant_school_head'', ''admin'', ''super admin''';
BEGIN
  EXECUTE format(
    'CREATE POLICY "school_management supervision insert" ON storage.objects
       FOR INSERT TO authenticated
       WITH CHECK (
         bucket_id = ''school-management''
         AND split_part(name, ''/'', 1) = %1$L
         AND EXISTS (
           SELECT 1 FROM procurements.sms_users u
           WHERE u.user_id = auth.uid() AND u.type IN (%2$s)
         )
       )', prefix, roles);

  EXECUTE format(
    'CREATE POLICY "school_management supervision update" ON storage.objects
       FOR UPDATE TO authenticated
       USING (
         bucket_id = ''school-management''
         AND split_part(name, ''/'', 1) = %1$L
         AND EXISTS (
           SELECT 1 FROM procurements.sms_users u
           WHERE u.user_id = auth.uid() AND u.type IN (%2$s)
         )
       )', prefix, roles);

  EXECUTE format(
    'CREATE POLICY "school_management supervision delete" ON storage.objects
       FOR DELETE TO authenticated
       USING (
         bucket_id = ''school-management''
         AND split_part(name, ''/'', 1) = %1$L
         AND EXISTS (
           SELECT 1 FROM procurements.sms_users u
           WHERE u.user_id = auth.uid() AND u.type IN (%2$s)
         )
       )', prefix, roles);
END $$;

-- ----------------------------------------------------------------------------
-- 2. The column now holds a storage OBJECT PATH, not a URL
--
--    Guarded so this migration is safe whether or not 121 has already been
--    applied, and re-runnable either way.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'procurements'
      AND table_name = 'sms_supervision_schedules'
      AND column_name = 'lesson_plan_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'procurements'
      AND table_name = 'sms_supervision_schedules'
      AND column_name = 'lesson_plan_path'
  ) THEN
    ALTER TABLE procurements.sms_supervision_schedules
      RENAME COLUMN lesson_plan_url TO lesson_plan_path;
  END IF;
END $$;

-- The original filename, so the UI can show "ILAW-Grade5-Math.docx" rather than
-- the uuid-prefixed object key, and downloads keep a meaningful name.
ALTER TABLE procurements.sms_supervision_schedules
  ADD COLUMN IF NOT EXISTS lesson_plan_name TEXT;

COMMENT ON COLUMN procurements.sms_supervision_schedules.lesson_plan_path IS
  'Object path under supervision-lesson-plans/ in the school-management bucket. That bucket is PUBLIC — anyone with the URL can read the file.';
COMMENT ON COLUMN procurements.sms_supervision_schedules.lesson_plan_name IS
  'Original filename as uploaded, for display and for the download filename.';
