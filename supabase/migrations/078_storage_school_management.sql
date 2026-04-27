-- ============================================================================
-- STORAGE: school-management bucket (public landing hero + future school assets)
-- ============================================================================
-- Public bucket: hero images load on /schools/[id] via public object URLs.
-- Storage API SELECT/INSERT/UPDATE/DELETE: authenticated only (see policies below).
-- Writes restricted: landing-hero/{sms_schools.id}/... matches caller's school,
-- or division_admin for any path under landing-hero/.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('school-management', 'school-management', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "school_management public read" ON storage.objects;
DROP POLICY IF EXISTS "school_management authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "school_management staff insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management staff update" ON storage.objects;
DROP POLICY IF EXISTS "school_management staff delete" ON storage.objects;

CREATE POLICY "school_management authenticated read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'school-management');

CREATE POLICY "school_management staff insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'landing-hero'
    AND (
      EXISTS (
        SELECT 1 FROM procurements.sms_users u
        WHERE u.user_id = auth.uid() AND u.type = 'division_admin'
      )
      OR split_part(name, '/', 2) = (
        SELECT u.school_id::text FROM procurements.sms_users u
        WHERE u.user_id = auth.uid() LIMIT 1
      )
    )
  );

CREATE POLICY "school_management staff update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'landing-hero'
    AND (
      EXISTS (
        SELECT 1 FROM procurements.sms_users u
        WHERE u.user_id = auth.uid() AND u.type = 'division_admin'
      )
      OR split_part(name, '/', 2) = (
        SELECT u.school_id::text FROM procurements.sms_users u
        WHERE u.user_id = auth.uid() LIMIT 1
      )
    )
  );

CREATE POLICY "school_management staff delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'landing-hero'
    AND (
      EXISTS (
        SELECT 1 FROM procurements.sms_users u
        WHERE u.user_id = auth.uid() AND u.type = 'division_admin'
      )
      OR split_part(name, '/', 2) = (
        SELECT u.school_id::text FROM procurements.sms_users u
        WHERE u.user_id = auth.uid() LIMIT 1
      )
    )
  );
