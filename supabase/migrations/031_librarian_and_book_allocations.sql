-- ============================================================================
-- LIBRARIAN ROLE AND SMS_BOOK_ALLOCATIONS
-- ============================================================================
-- Adds librarian (book manager) user type and book allocation table.
-- Book managers allocate book quantities to teachers/advisers who then issue to students.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- ADD librarian TO sms_users TYPE
-- ============================================================================
ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check
  CHECK (type IN ('school_head', 'teacher', 'registrar', 'admin', 'super admin', 'division_admin', 'librarian'));

-- ============================================================================
-- SMS_BOOK_ALLOCATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_book_allocations (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  book_id BIGINT NOT NULL REFERENCES procurements.sms_books(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  school_year TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, book_id, school_year)
);

CREATE INDEX IF NOT EXISTS idx_sms_book_allocations_school_id ON procurements.sms_book_allocations(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_book_allocations_teacher_id ON procurements.sms_book_allocations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sms_book_allocations_book_id ON procurements.sms_book_allocations(book_id);
CREATE INDEX IF NOT EXISTS idx_sms_book_allocations_school_year ON procurements.sms_book_allocations(school_year);

CREATE TRIGGER update_sms_book_allocations_updated_at
  BEFORE UPDATE ON procurements.sms_book_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_book_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Book allocations are viewable by authenticated users"
  ON procurements.sms_book_allocations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Book allocations are insertable by authenticated users"
  ON procurements.sms_book_allocations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Book allocations are updatable by authenticated users"
  ON procurements.sms_book_allocations FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Book allocations are deletable by authenticated users"
  ON procurements.sms_book_allocations FOR DELETE
  USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_book_allocations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_book_allocations_id_seq TO authenticated;

COMMENT ON TABLE procurements.sms_book_allocations IS 'Book quantity allocated by book manager to teachers/advisers per school year';
