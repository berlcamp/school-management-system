-- ============================================================================
-- CREATE STORAGE BUCKET FOR DIPLOMAS
-- ============================================================================
-- Private bucket for student diploma files. Access via signed URLs.
-- ============================================================================

-- Create diplomas bucket (private - requires signed URL or auth to access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('diplomas', 'diplomas', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Authenticated users (staff) can upload/read/update/delete
DROP POLICY IF EXISTS "Authenticated users can upload diplomas" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read diplomas" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update diplomas" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete diplomas" ON storage.objects;

CREATE POLICY "Authenticated users can upload diplomas"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'diplomas');

CREATE POLICY "Authenticated users can read diplomas"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'diplomas');

CREATE POLICY "Authenticated users can update diplomas"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'diplomas');

CREATE POLICY "Authenticated users can delete diplomas"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'diplomas');

-- Public/anon need SELECT for signed URL access when student prints approved diploma
-- Signed URLs work with the service role, so we need to allow anon to read when
-- they have a valid signed URL - actually signed URLs bypass RLS when using
-- createSignedUrl. So we don't need anon policy for download.
-- The signed URL is generated server-side or with service role for approved requests.
-- When using client createSignedUrl with anon key, RLS applies. So we need either:
-- (a) Server action/API route that generates signed URL (uses service role)
-- (b) Allow anon SELECT for diplomas - too permissive
-- Best: Use a server action or API that creates signed URL with service role.
-- For client-side, if user is not authenticated (public page), we need another approach.
-- Plan says: "Fetch signed URL from supabase.storage... createSignedUrl"
-- With anon key, createSignedUrl still needs RLS to pass. For private bucket,
-- anon cannot create signed URLs. We need a server-side API/action.
-- For now, keep bucket private; we'll create a server action to generate signed URLs
-- that the public page can call - the action will verify the request is approved
-- before returning the URL. So no anon policy needed for storage.
-- Policies above are sufficient for admin uploads.
