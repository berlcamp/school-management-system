-- ============================================================================
-- SMS_BOOKS AND SMS_BOOK_ISSUANCES TABLES
-- ============================================================================
-- Books catalog and issuance tracking for DepEd School Form 3 (SF3).
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- SMS_BOOKS TABLE (Book catalog)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_books (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject_area TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK (grade_level >= 1 AND grade_level <= 12),
  isbn TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_books_school_id ON procurements.sms_books(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_books_grade_level ON procurements.sms_books(grade_level);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_books_school_title_grade
  ON procurements.sms_books(school_id, title, grade_level)
  WHERE school_id IS NOT NULL;

CREATE TRIGGER update_sms_books_updated_at
  BEFORE UPDATE ON procurements.sms_books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Books are viewable by authenticated users"
  ON procurements.sms_books FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Books are insertable by authenticated users"
  ON procurements.sms_books FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Books are updatable by authenticated users"
  ON procurements.sms_books FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Books are deletable by authenticated users"
  ON procurements.sms_books FOR DELETE
  USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_books TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_books_id_seq TO authenticated;

COMMENT ON TABLE procurements.sms_books IS 'Book catalog for DepEd SF3 - Books Issued and Returned';

-- ============================================================================
-- SMS_BOOK_ISSUANCES TABLE (Issue/return records)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_book_issuances (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  book_id BIGINT NOT NULL REFERENCES procurements.sms_books(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  date_issued DATE NOT NULL,
  date_returned DATE,
  condition_on_return TEXT,
  return_code TEXT CHECK (return_code IN ('FM', 'TDO', 'NEG')),
  remarks TEXT,
  issued_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, book_id, section_id, school_year)
);

CREATE INDEX IF NOT EXISTS idx_sms_book_issuances_student ON procurements.sms_book_issuances(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_book_issuances_book ON procurements.sms_book_issuances(book_id);
CREATE INDEX IF NOT EXISTS idx_sms_book_issuances_section ON procurements.sms_book_issuances(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_book_issuances_school_year ON procurements.sms_book_issuances(school_year);
CREATE INDEX IF NOT EXISTS idx_sms_book_issuances_school_id ON procurements.sms_book_issuances(school_id);

CREATE TRIGGER update_sms_book_issuances_updated_at
  BEFORE UPDATE ON procurements.sms_book_issuances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_book_issuances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Book issuances are viewable by authenticated users"
  ON procurements.sms_book_issuances FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Book issuances are insertable by authenticated users"
  ON procurements.sms_book_issuances FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Book issuances are updatable by authenticated users"
  ON procurements.sms_book_issuances FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Book issuances are deletable by authenticated users"
  ON procurements.sms_book_issuances FOR DELETE
  USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_book_issuances TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_book_issuances_id_seq TO authenticated;

COMMENT ON TABLE procurements.sms_book_issuances IS 'Book issuance and return records for DepEd SF3';
COMMENT ON COLUMN procurements.sms_book_issuances.return_code IS 'FM=Force Majeure, TDO=Transferred/Dropout, NEG=Negligence (for unreturned books)';
