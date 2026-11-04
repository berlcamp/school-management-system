-- ============================================================================
-- 228 — Book publisher and source
-- ============================================================================
-- Adds two optional fields to the book catalogue, entered on the Add/Edit Book
-- form at /books:
--
--   publisher  free text
--   source     where the school received the title from: central_office,
--              regional_office, division_office or library_hub
--
-- `source` is free TEXT validated by the dropdown (BOOK_SOURCE_OPTIONS in
-- lib/constants/books.ts), per the 119/212 precedent: the value drives no
-- behaviour, so adding an office later is a constants change, not a migration.
--
-- Both columns are nullable and nothing is backfilled: every existing book keeps
-- NULL and shows a dash until someone edits it. Rows touched on apply: 0.
--
-- Two nullable columns. No index, policy, trigger, function or DML.
-- ============================================================================

ALTER TABLE procurements.sms_books
  ADD COLUMN IF NOT EXISTS publisher TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

COMMENT ON COLUMN procurements.sms_books.publisher IS
  'Publisher of this title, as typed on the book form. NULL = not recorded.';

COMMENT ON COLUMN procurements.sms_books.source IS
  'Where the school received this title from: central_office, regional_office, division_office or library_hub (BOOK_SOURCE_OPTIONS in lib/constants/books.ts). NULL = not recorded.';
