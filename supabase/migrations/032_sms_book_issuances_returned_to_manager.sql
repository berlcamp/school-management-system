-- ============================================================================
-- SMS_BOOK_ISSUANCES: TWO-STEP RETURN (TEACHER → BOOK MANAGER)
-- ============================================================================
-- Adds returned_to_manager_at for when teacher/adviser turns books in to book manager.
-- Flow: date_returned = student returned to teacher; returned_to_manager_at = teacher returned to manager.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_book_issuances
  ADD COLUMN IF NOT EXISTS returned_to_manager_at TIMESTAMPTZ;

COMMENT ON COLUMN procurements.sms_book_issuances.returned_to_manager_at IS 'When teacher/adviser returned this copy to the book manager (back to central stock)';
