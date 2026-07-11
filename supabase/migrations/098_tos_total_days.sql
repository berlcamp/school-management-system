-- ============================================================================
-- TOS — add total_days (instructional days for the whole term).
--
-- Total days is now a single document-level field (entered once, not per row).
-- Each competency's item count is derived as:
--   no_of_items = round( (competency no_of_days / total_days) * total_items )
-- (Idempotent ADD COLUMN for databases that applied 096 before this column.)
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_tos
  ADD COLUMN IF NOT EXISTS total_days NUMERIC(7,2) NOT NULL DEFAULT 0
    CHECK (total_days >= 0);

COMMENT ON COLUMN procurements.sms_tos.total_days IS
  'Total instructional days for the term; divides each competency''s days to size its item count.';
