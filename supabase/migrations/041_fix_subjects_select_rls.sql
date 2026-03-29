-- ============================================================================
-- FIX: Relax SELECT RLS on sms_subjects and sms_subject_schedules
-- ============================================================================
-- The policies from migration 037 require a matching sms_users.user_id row
-- to resolve school_id. If a user's auth UID is not linked in sms_users,
-- the subquery returns nothing and they see zero subjects/schedules —
-- even though they can see sections (which use a simple authenticated check).
--
-- Fix: match the sms_sections pattern — any authenticated user can SELECT.
-- The app already filters by school_id client-side. Write policies remain
-- role-restricted.
-- ============================================================================

-- 1. sms_subjects: replace strict SELECT policy with simple authenticated check
DROP POLICY IF EXISTS "Subjects are viewable by school members" ON procurements.sms_subjects;

CREATE POLICY "Subjects are viewable by authenticated users"
  ON procurements.sms_subjects FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. sms_subject_schedules: same fix
DROP POLICY IF EXISTS "Subject schedules are viewable by school members" ON procurements.sms_subject_schedules;

CREATE POLICY "Subject schedules are viewable by authenticated users"
  ON procurements.sms_subject_schedules FOR SELECT
  USING (auth.role() = 'authenticated');
