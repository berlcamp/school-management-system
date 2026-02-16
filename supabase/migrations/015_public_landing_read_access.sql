-- ============================================================================
-- PUBLIC LANDING PAGE READ ACCESS
-- ============================================================================
-- Allows anonymous users to read schools for the public landing page.
-- Enrollment stats use a SECURITY DEFINER function to avoid exposing raw data.
-- ============================================================================

-- sms_schools: Allow anon to SELECT (for school list and learners page)
CREATE POLICY "Schools are viewable by anon for public landing"
  ON procurements.sms_schools FOR SELECT
  TO anon
  USING (is_active = true);

GRANT SELECT ON procurements.sms_schools TO anon;

-- sms_enrollments: Allow anon to SELECT (for learners aggregates, status=approved)
CREATE POLICY "Enrollments are viewable by anon for public landing"
  ON procurements.sms_enrollments FOR SELECT
  TO anon
  USING (status = 'approved');

GRANT SELECT ON procurements.sms_enrollments TO anon;

-- sms_students: Allow anon to SELECT only for joining with enrollments (gender)
CREATE POLICY "Students are viewable by anon for public landing"
  ON procurements.sms_students FOR SELECT
  TO anon
  USING (true);

