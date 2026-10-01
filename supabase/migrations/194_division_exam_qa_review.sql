-- ============================================================================
-- 194 — Division TOS & examinations go through QA review
--
-- Until now a division TOS / exam (school_id NULL, 096/099) was written by the
-- division office and visible to every teacher the moment it was saved, and the
-- nine exam tables let ANY authenticated user insert, update or delete ANY row
-- (096/099's blanket policies; only the paper SELECTs were tightened, by 161).
-- From here:
--   * a new division-level role, `qa`, authorizes teachers and reviews;
--   * only a QA-authorized teacher may create a division row, and it reaches
--     the division only once a QA reviewer approves it;
--   * the division office no longer authors division rows at all;
--   * every status change goes through the exam_review_* functions below and is
--     written to sms_exam_review_events.
--
-- Private and school-wide rows (160) keep EXACTLY today's behaviour: every
-- policy below begins with `school_id IS NOT NULL OR …`, and `review_status`
-- stays NULL on them.
--
-- `review_status` is NULL for private / school-wide rows and one of
-- draft | submitted | under_review | approved | rejected for division rows, tied
-- by a CHECK. There is no separate "division available" value: that is
-- `approved`.
--
-- The only DML is the backfill: every existing division row becomes `approved`
-- (on the local clone: 1 TOS, 2 exams). They are what teachers
-- print, scan and analyse today; nothing disappears. They become immutable,
-- which they were not before — intended. A grandfathered row has no `approve`
-- event, which is how exam_review_reopen tells it apart.
--
-- QA reviewer as a SECOND role (163): `sms_switch_active_context` refuses a
-- NULL school, so a master teacher on the QA panel holds `qa` AT THEIR SCHOOL
-- in sms_user_roles. A dedicated QA account is type 'qa' with school_id NULL.
-- is_exam_qa() reads the active type only, so both behave the same.
--
-- Before applying to production (the user's job — never an agent's):
--   SELECT count(*) FROM procurements.sms_tos   WHERE school_id IS NULL;
--   SELECT count(*) FROM procurements.sms_exams WHERE school_id IS NULL;
-- Those are the rows the backfill marks approved.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. The role (158's constraint, plus 'qa')
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check
  CHECK (type IN (
    'school_head', 'assistant_school_head', 'teacher', 'volunteer_teacher',
    'registrar', 'admin', 'super admin', 'division_admin', 'division_type',
    'librarian', 'tutor', 'guidance_counselor', 'school_nurse', 'accounting',
    'security_guard', 'utility_worker', 'qa'));

-- ----------------------------------------------------------------------------
-- 2. Review columns (identical on both tables)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_tos', 'sms_exams'] LOOP
    EXECUTE format('ALTER TABLE procurements.%I
      ADD COLUMN IF NOT EXISTS review_status TEXT,
      ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reviewed_by BIGINT
        REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS review_comment TEXT', t);

    EXECUTE format('ALTER TABLE procurements.%1$I
      DROP CONSTRAINT IF EXISTS %1$s_review_status_check', t);
    EXECUTE format('ALTER TABLE procurements.%1$I
      ADD CONSTRAINT %1$s_review_status_check CHECK (review_status IS NULL
        OR review_status IN (''draft'', ''submitted'', ''under_review'',
                             ''approved'', ''rejected''))', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Backfill — the only DML. The flag lets it pass the review-field guard
--    (section 6) when this file is re-applied after the guard exists.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('sms.exam_review', 'on', true);
  UPDATE procurements.sms_tos
     SET review_status = 'approved', reviewed_at = created_at
   WHERE school_id IS NULL AND review_status IS NULL;
  UPDATE procurements.sms_exams
     SET review_status = 'approved', reviewed_at = created_at
   WHERE school_id IS NULL AND review_status IS NULL;
  PERFORM set_config('sms.exam_review', 'off', true);
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_tos', 'sms_exams'] LOOP
    EXECUTE format('ALTER TABLE procurements.%1$I
      DROP CONSTRAINT IF EXISTS %1$s_review_status_tier', t);
    EXECUTE format('ALTER TABLE procurements.%1$I
      ADD CONSTRAINT %1$s_review_status_tier
      CHECK ((school_id IS NULL) = (review_status IS NOT NULL))', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_tos_review_status
  ON procurements.sms_tos (review_status) WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sms_exams_review_status
  ON procurements.sms_exams (review_status) WHERE school_id IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Authorization and audit tables (FKs inline: both tables are new, so the
--    116 IF-NOT-EXISTS trap does not apply on first creation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_qa_authors (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL UNIQUE
                  REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  authorized_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by    BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  revoked_at    TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procurements.sms_exam_review_events (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('tos', 'exam', 'author')),
  entity_id   BIGINT NOT NULL,
  actor_id    BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL CHECK (action IN ('authorize', 'revoke', 'submit',
                'withdraw', 'start_review', 'approve', 'reject', 'reopen')),
  from_status TEXT,
  to_status   TEXT,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_exam_review_events_entity
  ON procurements.sms_exam_review_events (entity_type, entity_id, created_at);

ALTER TABLE procurements.sms_exam_qa_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_exam_review_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON procurements.sms_exam_qa_authors TO authenticated;
GRANT SELECT ON procurements.sms_exam_review_events TO authenticated;
-- Policies: section 9. Writes: only the section-8 functions (no write policy).
