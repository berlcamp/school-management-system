-- ============================================================================
-- Migration 159: pictures on exam questions and on their choices
-- ============================================================================
--
-- APPLY AFTER 099_exam_creator (the tables) and 078_storage_school_management
-- (the bucket).
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
--
-- 099 modelled a question as text and a choice as text, and a great many real
-- exam items are not: "Which of these is a rhombus?" over four shapes, a map to
-- read, a graph to interpret, a photo of laboratory apparatus, the picture-word
-- items that make up most of a Grade 1-3 paper. A teacher with a picture item
-- had to build the exam here for the item numbering and the answer key, then
-- paste the figures into Word by hand — at which point the printed paper and
-- the stored exam are two different documents, and the Item Analysis is keyed
-- to a paper nobody can reprint.
--
-- Four nullable columns and a storage prefix. The image is an ADDITION to the
-- text, never a replacement: a question keeps `question_text`, an option keeps
-- `choice_text`, and either may now also carry a figure. That is what lets a
-- picture item still read as an item — "Which of these is a rhombus?" above the
-- four shapes — and it is what keeps the answer key, the OMR answer sheet (132)
-- and the item analysis (101) working untouched, since none of them reads the
-- question body at all.
--
-- ---------------------------------------------------------------------------
-- The path, not a URL — the 122 lesson
-- ---------------------------------------------------------------------------
--
-- `image_path` holds the storage OBJECT PATH under `exam-images/` in the
-- existing `school-management` bucket, per the crla-materials / philiri-
-- materials / supervision-lesson-plans convention of 088 / 089 / 110 / 122.
-- The URL is composed at render time. 122 made this change the hard way — it
-- had to rename `lesson_plan_url` to `lesson_plan_path` a migration later — so
-- this one starts there. `image_name` keeps the original filename, for the
-- editor's "picture.png ✕" line and for a meaningful download.
--
-- ⚠ PRIVACY / EXAM-SECURITY NOTE: `school-management` is a PUBLIC bucket (078
-- sets `public = true`, so landing-page hero images resolve without auth). An
-- exam image is therefore readable by anyone who holds its object URL, with no
-- sign-in — including before the exam is given. The uuid in the path makes the
-- URL unguessable, but that is obscurity, not access control. It is the same
-- exposure every other attachment in this system already carries, and the
-- reason it is accepted here rather than worked around is the printed paper:
-- signed URLs expire (300s in the supervision module), and an exam left open in
-- a tab and printed twenty minutes later would print with broken figures. If
-- exam figures ever need to be genuinely restricted, they must move to a
-- private bucket (the `diplomas` pattern in 026) and the preview must re-sign
-- immediately before printing — flipping THIS bucket to private would break the
-- public hero images that depend on it.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- Four ADD COLUMN IF NOT EXISTS, all nullable, plus three storage policies on a
-- prefix that holds no objects yet. Nothing is backfilled, no constraint is
-- widened, no existing policy / trigger / function is replaced, and there is no
-- DML: every exam already authored keeps a NULL image and prints exactly as it
-- printed before. Idempotent; re-running is a no-op.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. The columns
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_exam_questions
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS image_name TEXT;

ALTER TABLE procurements.sms_exam_options
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS image_name TEXT;

COMMENT ON COLUMN procurements.sms_exam_questions.image_path IS
  'Optional figure shown with the question. Object path under exam-images/ in the PUBLIC school-management bucket — see the privacy note in migration 159. Adds to question_text, never replaces it.';
COMMENT ON COLUMN procurements.sms_exam_questions.image_name IS
  'Original filename as uploaded, for display in the editor and for the download filename.';
COMMENT ON COLUMN procurements.sms_exam_options.image_path IS
  'Optional figure shown with this choice (multiple choice) or this Column-B response (matching). Object path under exam-images/ in the PUBLIC school-management bucket.';
COMMENT ON COLUMN procurements.sms_exam_options.image_name IS
  'Original filename as uploaded, for display in the editor and for the download filename.';

-- ----------------------------------------------------------------------------
-- 2. Write policies for the exam-images/ prefix
--
--    078 grants bucket-wide SELECT to authenticated and the bucket is public,
--    so reads already work. Its INSERT/UPDATE/DELETE policies are scoped to
--    `landing-hero/` only, so without the policies below every upload fails
--    with "new row violates row-level security policy" — the prefix is
--    load-bearing, not cosmetic (122).
--
--    The role roster is EVERY role that can reach the Exam Creator: the sidebar
--    shows the Teacher Menu to every school-level role except division_admin,
--    tutors and the support roles, and /division/examinations adds the division
--    ones. RLS on sms_exam_questions itself is permissive `authenticated` (099),
--    so a narrower roster here would produce a half-failure that is worse than
--    either answer — the question row saves and only its picture is refused.
--    `tutor` is the one role left out: it has no Teacher Menu at all.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "school_management exam images insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management exam images update" ON storage.objects;
DROP POLICY IF EXISTS "school_management exam images delete" ON storage.objects;

DO $$
DECLARE
  prefix TEXT := 'exam-images';
  roles  TEXT := '''teacher'', ''volunteer_teacher'', ''school_head'', '
              || '''assistant_school_head'', ''admin'', ''registrar'', '
              || '''librarian'', ''super admin'', ''division_admin'', '
              || '''division_type''';
BEGIN
  EXECUTE format(
    'CREATE POLICY "school_management exam images insert" ON storage.objects
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
    'CREATE POLICY "school_management exam images update" ON storage.objects
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
    'CREATE POLICY "school_management exam images delete" ON storage.objects
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
