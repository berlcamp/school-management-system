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

-- ----------------------------------------------------------------------------
-- 5. Helpers. SECURITY DEFINER so a policy can call them without recursing
--    through RLS; search_path pinned (138). All read the ACTIVE role (163).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_me_id()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT u.id FROM procurements.sms_users u
  WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_me_type()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT u.type FROM procurements.sms_users u
  WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION procurements.is_exam_qa()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE(procurements.exam_me_type() IN ('qa', 'super admin'), false);
$$;

CREATE OR REPLACE FUNCTION procurements.is_exam_oversight()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE(procurements.exam_me_type()
    IN ('division_admin', 'division_type', 'super admin'), false);
$$;

CREATE OR REPLACE FUNCTION procurements.is_division_author()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE(procurements.exam_me_type() IN ('teacher', 'volunteer_teacher'), false)
     AND EXISTS (
       SELECT 1 FROM procurements.sms_exam_qa_authors a
       WHERE a.user_id = procurements.exam_me_id() AND a.is_active);
$$;

CREATE OR REPLACE FUNCTION procurements.can_see_division_row(
  p_status TEXT, p_created_by BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT p_status = 'approved'
      OR p_created_by = procurements.exam_me_id()
      OR procurements.is_exam_qa()
      OR procurements.is_exam_oversight();
$$;

CREATE OR REPLACE FUNCTION procurements.can_edit_tos(p_tos_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_tos t
    WHERE t.id = p_tos_id
      AND (t.school_id IS NOT NULL
           OR (t.created_by = procurements.exam_me_id()
               AND t.review_status IN ('draft', 'rejected')
               AND procurements.is_division_author())));
$$;

CREATE OR REPLACE FUNCTION procurements.can_edit_exam(p_exam_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_exams e
    WHERE e.id = p_exam_id
      AND (e.school_id IS NOT NULL
           OR (e.created_by = procurements.exam_me_id()
               AND e.review_status IN ('draft', 'rejected')
               AND procurements.is_division_author())));
$$;

CREATE OR REPLACE FUNCTION procurements.exam_has_approve_event(
  p_entity TEXT, p_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_exam_review_events ev
    WHERE ev.entity_type = p_entity AND ev.entity_id = p_id
      AND ev.action = 'approve');
$$;

GRANT EXECUTE ON FUNCTION
  procurements.exam_me_id(), procurements.exam_me_type(),
  procurements.is_exam_qa(), procurements.is_exam_oversight(),
  procurements.is_division_author(),
  procurements.can_see_division_row(TEXT, BIGINT),
  procurements.can_edit_tos(BIGINT), procurements.can_edit_exam(BIGINT),
  procurements.exam_has_approve_event(TEXT, BIGINT)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Guard triggers
-- ----------------------------------------------------------------------------
-- Review fields are written only by the exam_review_* functions (section 8),
-- which set the transaction-local flag. A new division row always starts as a
-- draft whatever the client sent. A row never crosses the division boundary:
-- otherwise a private exam could be moved into the division unreviewed.
CREATE OR REPLACE FUNCTION procurements.exam_guard_review_fields()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = procurements, public AS $$
BEGIN
  IF current_setting('sms.exam_review', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.school_id IS NULL THEN
      NEW.review_status := 'draft';
    ELSE
      NEW.review_status := NULL;
    END IF;
    NEW.submitted_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_comment := NULL;
    RETURN NEW;
  END IF;

  IF (OLD.school_id IS NULL) <> (NEW.school_id IS NULL) THEN
    RAISE EXCEPTION 'A TOS or exam cannot be moved into or out of the division level.';
  END IF;

  IF NEW.review_status  IS DISTINCT FROM OLD.review_status
  OR NEW.submitted_at   IS DISTINCT FROM OLD.submitted_at
  OR NEW.reviewed_by    IS DISTINCT FROM OLD.reviewed_by
  OR NEW.reviewed_at    IS DISTINCT FROM OLD.reviewed_at
  OR NEW.review_comment IS DISTINCT FROM OLD.review_comment THEN
    RAISE EXCEPTION 'Review status changes only through the QA review workflow.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_tos_guard_review_fields ON procurements.sms_tos;
CREATE TRIGGER sms_tos_guard_review_fields
  BEFORE INSERT OR UPDATE ON procurements.sms_tos
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_review_fields();

DROP TRIGGER IF EXISTS sms_exams_guard_review_fields ON procurements.sms_exams;
CREATE TRIGGER sms_exams_guard_review_fields
  BEFORE INSERT OR UPDATE ON procurements.sms_exams
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_review_fields();

-- Any exam on a division TOS needs that TOS approved; a division exam needs a
-- division TOS. SECURITY DEFINER: the caller may not be able to SELECT the TOS.
CREATE OR REPLACE FUNCTION procurements.exam_guard_tos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_school BIGINT;
  v_status TEXT;
BEGIN
  SELECT t.school_id, t.review_status INTO v_school, v_status
  FROM procurements.sms_tos t WHERE t.id = NEW.tos_id;

  IF NEW.school_id IS NULL AND (NOT FOUND OR v_school IS NOT NULL) THEN
    RAISE EXCEPTION 'A Division exam must be built on an approved Division TOS.';
  END IF;

  IF FOUND AND v_school IS NULL AND v_status <> 'approved' THEN
    RAISE EXCEPTION 'This TOS has not been approved by QA yet.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_exams_guard_tos ON procurements.sms_exams;
CREATE TRIGGER sms_exams_guard_tos
  BEFORE INSERT OR UPDATE OF tos_id, school_id ON procurements.sms_exams
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_tos();

CREATE OR REPLACE FUNCTION procurements.exam_guard_result_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM procurements.sms_exams e
    WHERE e.id = NEW.exam_id AND e.school_id IS NULL
      AND e.review_status <> 'approved') THEN
    RAISE EXCEPTION 'This Division exam has not been approved by QA yet.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_exam_results_guard_release ON procurements.sms_exam_results;
CREATE TRIGGER sms_exam_results_guard_release
  BEFORE INSERT ON procurements.sms_exam_results
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_result_release();

-- ----------------------------------------------------------------------------
-- 7. Main-table policies. Every one begins `school_id IS NOT NULL OR …`, which
--    is 096/099's `authenticated` rule unchanged for private / school rows.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t   TEXT;
  pol RECORD;
  fn  TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_tos', 'sms_exams'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname = 'procurements' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON procurements.%I', pol.policyname, t);
    END LOOP;

    fn := CASE t WHEN 'sms_tos' THEN 'can_edit_tos' ELSE 'can_edit_exam' END;

    EXECUTE format($p$CREATE POLICY "%1$s: select" ON procurements.%1$I
      FOR SELECT TO authenticated
      USING (school_id IS NOT NULL
             OR procurements.can_see_division_row(review_status, created_by))$p$, t);

    EXECUTE format($p$CREATE POLICY "%1$s: insert" ON procurements.%1$I
      FOR INSERT TO authenticated
      WITH CHECK (school_id IS NOT NULL
             OR (procurements.is_division_author()
                 AND created_by = procurements.exam_me_id()
                 AND review_status = 'draft'))$p$, t);

    EXECUTE format($p$CREATE POLICY "%1$s: update" ON procurements.%1$I
      FOR UPDATE TO authenticated
      USING (school_id IS NOT NULL OR procurements.%2$I(id))
      WITH CHECK (school_id IS NOT NULL OR procurements.%2$I(id))$p$, t, fn);

    EXECUTE format($p$CREATE POLICY "%1$s: delete" ON procurements.%1$I
      FOR DELETE TO authenticated
      USING (school_id IS NOT NULL
             OR (procurements.%2$I(id)
                 AND NOT procurements.exam_has_approve_event(%3$L, id)))$p$,
      t, fn, CASE t WHEN 'sms_tos' THEN 'tos' ELSE 'exam' END);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8a. Child tables. Writes follow the parent's edit rule, so an approved TOS or
--     exam is frozen down to its last option and answer-key row. Reads: TOS
--     children follow the parent's SELECT policy (the EXISTS runs under it);
--     the five paper tables keep 161's can_read_exam_paper, extended below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_id_of_question(p_question_id BIGINT)
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT q.exam_id FROM procurements.sms_exam_questions q WHERE q.id = p_question_id;
$$;
GRANT EXECUTE ON FUNCTION procurements.exam_id_of_question(BIGINT) TO authenticated, service_role;

DO $$
DECLARE
  t     TEXT;
  pol   RECORD;
  ref   TEXT;
  check_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_tos_competencies', 'sms_tos_items',
    'sms_exam_questions', 'sms_exam_sections', 'sms_exam_answer_keys',
    'sms_exam_options', 'sms_exam_subitems'] LOOP

    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname = 'procurements' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON procurements.%I', pol.policyname, t);
    END LOOP;

    IF t IN ('sms_tos_competencies', 'sms_tos_items') THEN
      check_expr := 'procurements.can_edit_tos(tos_id)';
      EXECUTE format($p$CREATE POLICY "%1$s: select" ON procurements.%1$I
        FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM procurements.sms_tos t
                       WHERE t.id = %1$I.tos_id))$p$, t);
    ELSE
      ref := CASE WHEN t IN ('sms_exam_options', 'sms_exam_subitems')
                  THEN 'procurements.exam_id_of_question(question_id)'
                  ELSE 'exam_id' END;
      check_expr := format('procurements.can_edit_exam(%s)', ref);
      -- 161's read gate, re-created verbatim in shape.
      EXECUTE format($p$CREATE POLICY "%1$s: select" ON procurements.%1$I
        FOR SELECT TO authenticated
        USING (procurements.can_read_exam_paper(%2$s))$p$, t, ref);
    END IF;

    EXECUTE format($p$CREATE POLICY "%1$s: insert" ON procurements.%1$I
      FOR INSERT TO authenticated WITH CHECK (%2$s)$p$, t, check_expr);
    EXECUTE format($p$CREATE POLICY "%1$s: update" ON procurements.%1$I
      FOR UPDATE TO authenticated USING (%2$s) WITH CHECK (%2$s)$p$, t, check_expr);
    EXECUTE format($p$CREATE POLICY "%1$s: delete" ON procurements.%1$I
      FOR DELETE TO authenticated USING (%2$s)$p$, t, check_expr);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8b. can_read_exam_paper (161), extended: an unapproved division exam is
--     readable only by its author, QA and the division office — before any
--     release-code branch. The rest is 161's body unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.can_read_exam_paper(p_exam_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_school BIGINT;
  v_status TEXT;
  v_author BIGINT;
BEGIN
  SELECT e.school_id, e.review_status, e.created_by
    INTO v_school, v_status, v_author
  FROM procurements.sms_exams e WHERE e.id = p_exam_id;

  IF FOUND AND v_school IS NULL AND v_status <> 'approved' THEN
    RETURN v_author = procurements.exam_me_id()
        OR procurements.is_exam_qa()
        OR procurements.is_exam_oversight();
  END IF;

  RETURN
    NOT EXISTS (
      SELECT 1 FROM procurements.sms_exam_release_codes c
      WHERE c.exam_id = p_exam_id)
    OR EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin', 'super admin', 'division_type'))
    OR procurements.can_manage_exam(p_exam_id)
    OR EXISTS (
      SELECT 1
      FROM procurements.sms_exam_unlocks x
      JOIN procurements.sms_users u ON u.id = x.user_id
      WHERE x.exam_id = p_exam_id AND u.user_id = auth.uid());
END;
$$;

-- ----------------------------------------------------------------------------
-- 8c. can_manage_exam (161), replaced, same signature. A division exam's code
--     is held by the division office and QA, and only once it is approved
--     (decision 2). The author branch now applies to school-level exams only.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.can_manage_exam(p_exam_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_exams e
    CROSS JOIN LATERAL (
      SELECT u.id, u.type, u.school_id
      FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
      LIMIT 1
    ) me
    WHERE e.id = p_exam_id
      AND (
        (e.school_id IS NULL
          AND e.review_status = 'approved'
          AND me.type IN ('division_admin', 'super admin', 'division_type', 'qa'))
        OR (e.school_id IS NOT NULL AND me.id = e.created_by)
        OR (e.school_id IS NOT NULL
            AND e.is_school_shared
            AND me.school_id = e.school_id
            AND me.type IN ('school_head', 'assistant_school_head', 'admin'))
      )
  );
$$;

COMMENT ON FUNCTION procurements.can_manage_exam IS
  'True when the signed-in user may set, read or clear this exam''s release code: for an APPROVED division exam the division office and QA (194); for a school-level exam its author, plus school_head / assistant_school_head / admin at the school for a school-wide exam (160).';
