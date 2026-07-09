-- ============================================================================
-- Phil-IRI — rework to uploaded material + GST screening scoresheet
--
-- The division office no longer authors the passage/questions inside the app.
-- Instead they upload the ready DepEd material (image or PDF) and describe it
-- (title, grade, language, set label, passage word count, instructions).
--
-- Section advisers download that file and record the DepEd Group Screening Test
-- Class Reading Record (STCRR / Form 1B for English, TPPK / Form 1A for
-- Filipino) per learner:
--   - test_taken            (✓ / X)
--   - literal_correct       (out of 7)
--   - inferential_correct   (out of 7)
--   - critical_correct      (out of 6)
--   - total_score           (= sum, out of 20)
--   - screening_result      (≥14 → no need for Phil-IRI; <14 → for Phil-IRI)
--
-- Columns are ADDED (not dropped) so existing rows and the older passage/
-- comprehension columns remain intact. The sms_philiri_questions /
-- sms_philiri_answers tables are simply no longer written to.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- Materials: uploaded file (image / PDF)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_philiri_materials
  ADD COLUMN IF NOT EXISTS file_url  TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT;

-- ----------------------------------------------------------------------------
-- Records: GST screening scoresheet fields
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_philiri_records
  ADD COLUMN IF NOT EXISTS test_taken          BOOLEAN,
  ADD COLUMN IF NOT EXISTS literal_correct     INTEGER CHECK (literal_correct     IS NULL OR literal_correct     >= 0),
  ADD COLUMN IF NOT EXISTS inferential_correct INTEGER CHECK (inferential_correct IS NULL OR inferential_correct >= 0),
  ADD COLUMN IF NOT EXISTS critical_correct    INTEGER CHECK (critical_correct    IS NULL OR critical_correct    >= 0),
  ADD COLUMN IF NOT EXISTS total_score         INTEGER CHECK (total_score         IS NULL OR total_score         >= 0),
  ADD COLUMN IF NOT EXISTS screening_result    TEXT;

-- ----------------------------------------------------------------------------
-- Storage: grant division authors write access to the philiri-materials/ path
-- of the public `school-management` bucket. Authenticated read is already
-- granted bucket-wide by migration 078; the per-path INSERT/UPDATE/DELETE
-- policies from 078 (landing-hero) and 088 (crla-materials) do NOT cover this
-- prefix, so uploads here need their own policies (mirrors 088).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "school_management philiri insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management philiri update" ON storage.objects;
DROP POLICY IF EXISTS "school_management philiri delete" ON storage.objects;

CREATE POLICY "school_management philiri insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'philiri-materials'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin', 'super admin')
    )
  );

CREATE POLICY "school_management philiri update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'philiri-materials'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin', 'super admin')
    )
  );

CREATE POLICY "school_management philiri delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'school-management'
    AND split_part(name, '/', 1) = 'philiri-materials'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin', 'super admin')
    )
  );
