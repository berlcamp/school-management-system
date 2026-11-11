-- =============================================================================
-- 233 — SBFP Food Dispatch: a barangay as the Assigned Kitchen
-- =============================================================================
--
-- 230 let the Kitchen tool name a barangay as its Assigned Kitchen and left the
-- Food Dispatch log alone. Food cooked at a barangay leaves from that barangay,
-- so the Dispatch tool needs the same choice. This is 230's Part B verbatim on
-- sms_sbfp_dispatch_logs.
--
-- sms_sbfp_dispatch_logs.kitchen_barangay: free TEXT, app-validated against
-- BAYUGAN_BARANGAYS in lib/constants/sbfp.ts (per 119/230), so a renamed barangay
-- never invalidates a filed entry. NULL kitchen + NULL barangay = at school site,
-- as before. NULL on every existing row, so every existing log reads as it did.
--
-- One nullable column and one CHECK. No policy, function or trigger touched; no
-- DML. Existing rows all satisfy the CHECK (the column is NULL on all of them).
--
-- Tests: supabase/tests/233_sbfp_dispatch_barangay_kitchen.sql
-- =============================================================================

ALTER TABLE procurements.sms_sbfp_dispatch_logs
  ADD COLUMN IF NOT EXISTS kitchen_barangay TEXT;

-- One place only: a centralized kitchen, or a barangay, or neither (at school site).
ALTER TABLE procurements.sms_sbfp_dispatch_logs
  DROP CONSTRAINT IF EXISTS sms_sbfp_dispatch_logs_barangay_check;
ALTER TABLE procurements.sms_sbfp_dispatch_logs
  ADD CONSTRAINT sms_sbfp_dispatch_logs_barangay_check CHECK (
    kitchen_barangay IS NULL
    OR (kitchen_id IS NULL AND btrim(kitchen_barangay) <> '')
  );

COMMENT ON COLUMN procurements.sms_sbfp_dispatch_logs.kitchen_barangay IS
  'Barangay acting as the Assigned Kitchen (migration 233). NULL = a centralized kitchen (kitchen_id) or at school site.';

NOTIFY pgrst, 'reload schema';
