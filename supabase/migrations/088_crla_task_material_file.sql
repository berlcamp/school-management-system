-- ============================================================================
-- CRLA scoring tasks: downloadable material file (image / PDF) per task
-- ============================================================================
-- The division authors a CRLA material and, per scoring task, attaches the
-- learner-facing material (image or PDF). Section advisers download it from
-- the teacher CRLA scoresheet. Files live in the public `school-management`
-- bucket under `crla-materials/{material_id}/...`.
-- ============================================================================

ALTER TABLE procurements.sms_crla_material_tasks
  ADD COLUMN IF NOT EXISTS file_url  TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT;

COMMENT ON COLUMN procurements.sms_crla_material_tasks.file_url IS
  'Public URL of the uploaded task material (image/PDF) that section advisers download.';
COMMENT ON COLUMN procurements.sms_crla_material_tasks.file_name IS
  'Original filename of the uploaded task material, shown as the download label.';

-- Storage: authenticated read is already granted bucket-wide by migration 078,
-- so advisers can download. Grant division authors write access to the
-- crla-materials/ path (in addition to the landing-hero/ policies from 078).
DROP POLICY IF EXISTS "school_management crla insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management crla update" ON storage.objects;
DROP POLICY IF EXISTS "school_management crla delete" ON storage.objects;

CREATE POLICY "school_management crla insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'crla-materials'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin', 'super admin')
    )
  );

CREATE POLICY "school_management crla update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'crla-materials'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin', 'super admin')
    )
  );

CREATE POLICY "school_management crla delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'crla-materials'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin', 'super admin')
    )
  );
