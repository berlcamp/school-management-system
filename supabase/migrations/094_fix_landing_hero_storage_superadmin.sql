-- ============================================================================
-- FIX: landing-hero banner upload fails with "new row violates row-level
-- security policy" for super admins.
-- ============================================================================
-- Migration 078 restricted landing-hero writes to either:
--   (a) users whose sms_users.school_id matches the path's school segment, or
--   (b) users with type = 'division_admin'.
--
-- A "super admin" is neither: on /settings the app uses the super admin's
-- ACTIVE school override (AuthGuard.tsx) as user.school_id, so the upload path
-- becomes landing-hero/{override_school}/... while their own sms_users.school_id
-- is null / a different home school. Branch (a) fails, and branch (b) excludes
-- super admin -> RLS denies the INSERT.
--
-- The newer CRLA/Phil-IRI storage policies (088, 089) already treat
-- ('division_admin', 'super admin') as full-access authors. Align the
-- landing-hero write policies with that pattern. Also re-assert the bucket so
-- this migration is self-sufficient if 078 was never applied.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('school-management', 'school-management', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "school_management staff insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management staff update" ON storage.objects;
DROP POLICY IF EXISTS "school_management staff delete" ON storage.objects;

CREATE POLICY "school_management staff insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'landing-hero'
    AND (
      EXISTS (
        SELECT 1 FROM procurements.sms_users u
        WHERE u.user_id = auth.uid()
          AND u.type IN ('division_admin', 'super admin')
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
        WHERE u.user_id = auth.uid()
          AND u.type IN ('division_admin', 'super admin')
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
        WHERE u.user_id = auth.uid()
          AND u.type IN ('division_admin', 'super admin')
      )
      OR split_part(name, '/', 2) = (
        SELECT u.school_id::text FROM procurements.sms_users u
        WHERE u.user_id = auth.uid() LIMIT 1
      )
    )
  );
