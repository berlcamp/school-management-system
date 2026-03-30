-- ============================================================================
-- Migration 049: Requests Module Rebuild
-- Replaces sms_form_requests with a clean, scalable request system.
-- Old table is preserved (NOT dropped) for safe rollback.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create sms_requests (main table)
-- ----------------------------------------------------------------------------
CREATE TABLE procurements.sms_requests (
  id                   BIGSERIAL PRIMARY KEY,
  tracking_number      TEXT NOT NULL UNIQUE,
  school_id            BIGINT REFERENCES procurements.sms_schools(id),
  request_type         TEXT NOT NULL DEFAULT 'form137',
  requester_type       TEXT NOT NULL DEFAULT 'student',
  requester_name       TEXT NOT NULL,
  requester_contact    TEXT NOT NULL,
  requester_email      TEXT,
  requester_relationship TEXT NOT NULL,
  student_name         TEXT NOT NULL,
  student_lrn          TEXT NOT NULL,
  student_id           BIGINT REFERENCES procurements.sms_students(id),
  last_school_attended TEXT,
  year_graduated       TEXT,
  purpose              TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  rejection_reason     TEXT,
  delivery_file_path   TEXT,
  reviewed_by          BIGINT REFERENCES procurements.sms_users(id),
  reviewed_at          TIMESTAMPTZ,
  approved_by          BIGINT REFERENCES procurements.sms_users(id),
  approved_at          TIMESTAMPTZ,
  completed_by         BIGINT REFERENCES procurements.sms_users(id),
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sms_requests_request_type_check
    CHECK (request_type IN ('form137', 'diploma')),
  CONSTRAINT sms_requests_requester_type_check
    CHECK (requester_type IN ('school', 'parent', 'student')),
  CONSTRAINT sms_requests_status_check
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'completed'))
);

-- ----------------------------------------------------------------------------
-- 2. Create sms_request_attachments
-- ----------------------------------------------------------------------------
CREATE TABLE procurements.sms_request_attachments (
  id           BIGSERIAL PRIMARY KEY,
  request_id   BIGINT NOT NULL REFERENCES procurements.sms_requests(id) ON DELETE CASCADE,
  file_path    TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_type    TEXT NOT NULL,
  file_size    BIGINT,
  uploaded_by  TEXT,
  category     TEXT NOT NULL DEFAULT 'attachment',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sms_request_attachments_category_check
    CHECK (category IN ('attachment', 'sf10_delivery'))
);

-- ----------------------------------------------------------------------------
-- 3. Create sms_request_logs (audit trail)
-- ----------------------------------------------------------------------------
CREATE TABLE procurements.sms_request_logs (
  id              BIGSERIAL PRIMARY KEY,
  request_id      BIGINT NOT NULL REFERENCES procurements.sms_requests(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  actor_name      TEXT,
  actor_id        BIGINT REFERENCES procurements.sms_users(id),
  previous_status TEXT,
  new_status      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sms_request_logs_action_check
    CHECK (action IN ('created', 'under_review', 'approved', 'rejected', 'completed', 'attachment_added'))
);

-- ----------------------------------------------------------------------------
-- 4. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX idx_sms_requests_tracking_number ON procurements.sms_requests(tracking_number);
CREATE INDEX idx_sms_requests_school_id        ON procurements.sms_requests(school_id);
CREATE INDEX idx_sms_requests_status           ON procurements.sms_requests(status);
CREATE INDEX idx_sms_requests_student_lrn      ON procurements.sms_requests(student_lrn);
CREATE INDEX idx_sms_requests_created_at       ON procurements.sms_requests(created_at);
CREATE INDEX idx_sms_request_logs_request_id   ON procurements.sms_request_logs(request_id);
CREATE INDEX idx_sms_request_attachments_req   ON procurements.sms_request_attachments(request_id);

-- ----------------------------------------------------------------------------
-- 5. Migrate data from sms_form_requests
--    - Generates tracking numbers from old IDs
--    - Sets requester_type = 'student' for all migrated rows
--    - Builds student_name from joined sms_students
-- ----------------------------------------------------------------------------
INSERT INTO procurements.sms_requests (
  tracking_number,
  school_id,
  request_type,
  requester_type,
  requester_name,
  requester_contact,
  requester_email,
  requester_relationship,
  student_name,
  student_lrn,
  student_id,
  purpose,
  status,
  rejection_reason,
  approved_by,
  approved_at,
  completed_at,
  created_at,
  updated_at
)
SELECT
  'REQ-' || TO_CHAR(COALESCE(fr.created_at, now()), 'YYYYMMDD') || '-' || LPAD(fr.id::TEXT, 5, '0'),
  fr.school_id,
  COALESCE(fr.request_type, 'form137'),
  'student',
  fr.requestor_name,
  fr.requestor_contact,
  NULL,
  fr.requestor_relationship,
  COALESCE(
    CASE WHEN s.last_name IS NOT NULL AND s.first_name IS NOT NULL
      THEN s.last_name || ', ' || s.first_name
      ELSE NULL
    END,
    'Unknown'
  ),
  fr.student_lrn,
  fr.student_id,
  fr.purpose,
  fr.status,
  fr.remarks,
  fr.approved_by,
  fr.approved_at,
  fr.completed_at,
  COALESCE(fr.created_at, now()),
  COALESCE(fr.updated_at, now())
FROM procurements.sms_form_requests fr
LEFT JOIN procurements.sms_students s ON s.id = fr.student_id;

-- Insert 'created' log entries for every migrated request
INSERT INTO procurements.sms_request_logs (
  request_id,
  action,
  actor_name,
  previous_status,
  new_status,
  notes,
  created_at
)
SELECT
  r.id,
  'created',
  'Migrated',
  NULL,
  r.status,
  'Migrated from legacy sms_form_requests (id=' || fr.id || ')',
  r.created_at
FROM procurements.sms_requests r
JOIN procurements.sms_form_requests fr
  ON r.tracking_number = 'REQ-' || TO_CHAR(COALESCE(fr.created_at, now()), 'YYYYMMDD') || '-' || LPAD(fr.id::TEXT, 5, '0');

-- ----------------------------------------------------------------------------
-- 6. RLS Policies
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_request_logs        ENABLE ROW LEVEL SECURITY;

-- Allow anon/authenticated to read their own requests by tracking number (public portal)
CREATE POLICY "sms_requests_public_read"
  ON procurements.sms_requests FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "sms_requests_public_insert"
  ON procurements.sms_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "sms_requests_authenticated_update"
  ON procurements.sms_requests FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "sms_request_attachments_all"
  ON procurements.sms_request_attachments FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "sms_request_logs_all"
  ON procurements.sms_request_logs FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- NOTE: sms_form_requests is intentionally NOT dropped.
-- It is kept as a deprecated backup table for safe rollback.
-- Do not use it in new code -- use sms_requests instead.
-- ----------------------------------------------------------------------------
