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
-- The backfill also bumps `updated_at` on those rows: 096/099's BEFORE UPDATE
-- trigger (update_updated_at_column) stamps NOW() on any UPDATE, so after
-- applying, the backfilled rows read as last edited at apply time. Their
-- `reviewed_at` is set to `created_at`, which is the honest date to show.
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
--
-- After applying, verify the EXECUTE grants (read-only):
--   SELECT p.proname, p.prosecdef, p.proacl
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'procurements'
--      AND p.proname IN (
--        'exam_me_id', 'exam_me_type', 'is_exam_qa', 'is_exam_oversight',
--        'is_division_author', 'can_see_division_row', 'can_edit_tos',
--        'can_edit_exam', 'exam_has_approve_event', 'exam_id_of_question',
--        'exam_guard_review_fields', 'exam_guard_tos', 'exam_guard_result_release',
--        'exam_review_table', 'exam_review_load', 'exam_review_transition',
--        'exam_qa_authorize', 'exam_qa_revoke', 'exam_review_submit',
--        'exam_review_withdraw', 'exam_review_start', 'exam_review_decide',
--        'exam_review_reopen', 'can_read_exam_paper', 'can_manage_exam')
--    ORDER BY p.proname;
-- Expected: the six internal / trigger functions (exam_guard_review_fields,
-- exam_guard_tos, exam_guard_result_release, exam_review_table,
-- exam_review_load, exam_review_transition) show NO `authenticated=X`,
-- `anon=X` or bare `=X` (PUBLIC) entry — only the owner (and service_role,
-- if production's default privileges grant it). Every other function shows
-- `authenticated=X` and no `anon=X` / `=X`, except can_read_exam_paper /
-- can_manage_exam, which keep whatever 161 gave them (PUBLIC included).
-- An entry granted by production's default privileges that survives here
-- means a REVOKE below did not run; stop and report it.
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
-- Policies: section 9. Writes: only the section-10 functions (no write policy).

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
-- Review fields are written only by the exam_review_* functions (section 10),
-- which set the transaction-local flag. A new division row always starts as a
-- draft whatever the client sent. A row never crosses the division boundary:
-- otherwise a private exam could be moved into the division unreviewed. A
-- division row's author never changes: authorship is what the self-review,
-- withdraw and edit rules key on, so handing a row to someone else would let
-- it skip them. The one exception is the FK's ON DELETE SET NULL: when the
-- author's or reviewer's sms_users row is deleted, created_by / reviewed_by
-- go to NULL. Without letting that through, deleting any user who ever wrote
-- or reviewed a division row would fail. Only the change TO NULL is admitted,
-- and reviewed_by only when it is the sole review-field change.
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

  IF OLD.school_id IS NULL
     AND NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'The author of a Division TOS or exam cannot be changed.';
  END IF;

  IF NEW.review_status  IS DISTINCT FROM OLD.review_status
  OR NEW.submitted_at   IS DISTINCT FROM OLD.submitted_at
  OR (NEW.reviewed_by   IS DISTINCT FROM OLD.reviewed_by
      AND NEW.reviewed_by IS NOT NULL)
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
-- FOR SHARE serializes against exam_review_reopen's FOR UPDATE: a reopen that
-- commits first is seen here (the locked row is re-read), and one that comes
-- second waits and then sees this exam.
CREATE OR REPLACE FUNCTION procurements.exam_guard_tos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_school BIGINT;
  v_status TEXT;
BEGIN
  SELECT t.school_id, t.review_status INTO v_school, v_status
  FROM procurements.sms_tos t WHERE t.id = NEW.tos_id
  FOR SHARE;

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

-- FOR SHARE for the same reason as exam_guard_tos: a concurrent reopen of the
-- exam and a first result recorded against it cannot both succeed.
CREATE OR REPLACE FUNCTION procurements.exam_guard_result_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_school BIGINT;
  v_status TEXT;
BEGIN
  SELECT e.school_id, e.review_status INTO v_school, v_status
  FROM procurements.sms_exams e WHERE e.id = NEW.exam_id
  FOR SHARE;

  IF FOUND AND v_school IS NULL AND v_status <> 'approved' THEN
    RAISE EXCEPTION 'This Division exam has not been approved by QA yet.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_exam_results_guard_release ON procurements.sms_exam_results;
CREATE TRIGGER sms_exam_results_guard_release
  BEFORE INSERT OR UPDATE OF exam_id ON procurements.sms_exam_results
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

-- ----------------------------------------------------------------------------
-- 9. Audit and authorization reads
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sms_exam_review_events: select" ON procurements.sms_exam_review_events;
CREATE POLICY "sms_exam_review_events: select" ON procurements.sms_exam_review_events
  FOR SELECT TO authenticated
  USING (
    procurements.is_exam_qa() OR procurements.is_exam_oversight()
    OR (entity_type = 'tos' AND EXISTS (
          SELECT 1 FROM procurements.sms_tos t
          WHERE t.id = entity_id AND t.created_by = procurements.exam_me_id()))
    OR (entity_type = 'exam' AND EXISTS (
          SELECT 1 FROM procurements.sms_exams e
          WHERE e.id = entity_id AND e.created_by = procurements.exam_me_id()))
    OR (entity_type = 'author' AND EXISTS (
          SELECT 1 FROM procurements.sms_exam_qa_authors a
          WHERE a.id = entity_id AND a.user_id = procurements.exam_me_id())));

DROP POLICY IF EXISTS "sms_exam_qa_authors: select" ON procurements.sms_exam_qa_authors;
CREATE POLICY "sms_exam_qa_authors: select" ON procurements.sms_exam_qa_authors
  FOR SELECT TO authenticated
  USING (procurements.is_exam_qa() OR procurements.is_exam_oversight()
         OR user_id = procurements.exam_me_id());

-- ----------------------------------------------------------------------------
-- 10. Workflow. The only writers of review fields and of the audit table.
--     Notifications are deferred: no function here writes one.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_review_table(p_entity TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_entity = 'tos' THEN RETURN 'sms_tos'; END IF;
  IF p_entity = 'exam' THEN RETURN 'sms_exams'; END IF;
  RAISE EXCEPTION 'Unknown review item "%".', p_entity;
END;
$$;

-- Locks and returns the row; refuses anything that is not a division row.
CREATE OR REPLACE FUNCTION procurements.exam_review_load(
  p_entity TEXT, p_id BIGINT,
  OUT o_status TEXT, OUT o_created_by BIGINT, OUT o_tos_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_school BIGINT;
  v_found  INT;
BEGIN
  EXECUTE format(
    'SELECT review_status, created_by, school_id, %s FROM procurements.%I WHERE id = $1 FOR UPDATE',
    CASE p_entity WHEN 'exam' THEN 'tos_id' ELSE 'NULL::BIGINT' END,
    procurements.exam_review_table(p_entity))
  INTO o_status, o_created_by, v_school, o_tos_id
  USING p_id;
  GET DIAGNOSTICS v_found = ROW_COUNT;

  IF v_found = 0 THEN
    RAISE EXCEPTION 'That item does not exist.';
  END IF;
  IF v_school IS NOT NULL THEN
    RAISE EXCEPTION 'Only Division TOS and exams go through QA review.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_transition(
  p_entity TEXT, p_id BIGINT, p_action TEXT,
  p_from TEXT, p_to TEXT, p_comment TEXT, p_author BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_me BIGINT := procurements.exam_me_id();
BEGIN
  PERFORM set_config('sms.exam_review', 'on', true);

  EXECUTE format($u$
    UPDATE procurements.%I SET
      review_status  = $2,
      submitted_at   = CASE WHEN $3 = 'submit' THEN NOW() ELSE submitted_at END,
      reviewed_by    = CASE WHEN $3 = 'submit' THEN NULL
                            WHEN $3 IN ('start_review', 'approve', 'reject', 'reopen') THEN $4
                            ELSE reviewed_by END,
      reviewed_at    = CASE WHEN $3 = 'submit' THEN NULL
                            WHEN $3 IN ('approve', 'reject', 'reopen') THEN NOW()
                            ELSE reviewed_at END,
      review_comment = CASE WHEN $3 = 'submit' THEN NULL
                            WHEN $3 IN ('approve', 'reject', 'reopen') THEN $5
                            ELSE review_comment END,
      updated_at     = NOW()
    WHERE id = $1 $u$, procurements.exam_review_table(p_entity))
  USING p_id, p_to, p_action, v_me, p_comment;

  INSERT INTO procurements.sms_exam_review_events
    (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
  VALUES (p_entity, p_id, v_me, p_action, p_from, p_to, p_comment);

  PERFORM set_config('sms.exam_review', 'off', true);
END;
$$;

-- --- authorization ----------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_qa_authorize(p_user_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_id   BIGINT;
  v_prev BOOLEAN;
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may authorize teachers.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.id = p_user_id AND u.is_active
      AND (u.type IN ('teacher', 'volunteer_teacher') OR EXISTS (
        SELECT 1 FROM procurements.sms_user_roles r
        WHERE r.user_id = u.id AND r.role IN ('teacher', 'volunteer_teacher')))) THEN
    RAISE EXCEPTION 'Only an active teacher can be authorized to write Division TOS.';
  END IF;

  SELECT a.id, a.is_active INTO v_id, v_prev
  FROM procurements.sms_exam_qa_authors a WHERE a.user_id = p_user_id FOR UPDATE;

  IF v_prev THEN
    RAISE EXCEPTION 'That teacher is already authorized.';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO procurements.sms_exam_qa_authors (user_id, authorized_by)
    VALUES (p_user_id, procurements.exam_me_id())
    RETURNING id INTO v_id;
  ELSE
    UPDATE procurements.sms_exam_qa_authors
       SET is_active = true, authorized_by = procurements.exam_me_id(),
           authorized_at = NOW(), revoked_by = NULL, revoked_at = NULL,
           revoke_reason = NULL, updated_at = NOW()
     WHERE id = v_id;
  END IF;

  INSERT INTO procurements.sms_exam_review_events
    (entity_type, entity_id, actor_id, action, from_status, to_status)
  VALUES ('author', v_id, procurements.exam_me_id(), 'authorize',
          CASE WHEN v_prev IS NULL THEN NULL ELSE 'revoked' END, 'active');
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_qa_revoke(p_user_id BIGINT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_id BIGINT;
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may revoke an authorization.';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to revoke an authorization.';
  END IF;

  UPDATE procurements.sms_exam_qa_authors
     SET is_active = false, revoked_by = procurements.exam_me_id(),
         revoked_at = NOW(), revoke_reason = btrim(p_reason), updated_at = NOW()
   WHERE user_id = p_user_id AND is_active
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'That teacher is not currently authorized.';
  END IF;

  INSERT INTO procurements.sms_exam_review_events
    (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
  VALUES ('author', v_id, procurements.exam_me_id(), 'revoke', 'active', 'revoked', btrim(p_reason));
END;
$$;

-- --- review -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_review_submit(p_entity TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);

  IF r.o_created_by IS DISTINCT FROM procurements.exam_me_id() THEN
    RAISE EXCEPTION 'Only the author can submit this for review.';
  END IF;
  IF NOT procurements.is_division_author() THEN
    RAISE EXCEPTION 'You are not currently authorized to write Division TOS or exams.';
  END IF;
  IF r.o_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only a draft or returned item can be submitted (this one is %).', r.o_status;
  END IF;

  IF p_entity = 'tos' THEN
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos_competencies c WHERE c.tos_id = p_id) THEN
      RAISE EXCEPTION 'Add at least one competency before submitting.';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos t
                   WHERE t.id = r.o_tos_id AND t.school_id IS NULL
                     AND t.review_status = 'approved') THEN
      RAISE EXCEPTION 'This exam''s TOS is not an approved Division TOS.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_exam_questions q WHERE q.exam_id = p_id) THEN
      RAISE EXCEPTION 'Add at least one question before submitting.';
    END IF;
  END IF;

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'submit', r.o_status, 'submitted', NULL, r.o_created_by);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_withdraw(p_entity TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);
  IF r.o_created_by IS DISTINCT FROM procurements.exam_me_id() THEN
    RAISE EXCEPTION 'Only the author can withdraw this.';
  END IF;
  IF r.o_status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted item that QA has not started reviewing can be withdrawn.';
  END IF;
  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'withdraw', r.o_status, 'draft', NULL, r.o_created_by);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_start(p_entity TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE r RECORD;
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may review Division TOS and exams.';
  END IF;
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);
  IF r.o_created_by = procurements.exam_me_id() THEN
    RAISE EXCEPTION 'You cannot review your own submission.';
  END IF;
  IF r.o_status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted item can be taken for review (this one is %).', r.o_status;
  END IF;
  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'start_review', r.o_status, 'under_review', NULL, r.o_created_by);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_decide(
  p_entity TEXT, p_id BIGINT, p_decision TEXT, p_comment TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  r RECORD;
  v_comment TEXT := NULLIF(btrim(p_comment), '');
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may review Division TOS and exams.';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Decision must be approve or reject.';
  END IF;
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);
  IF r.o_created_by = procurements.exam_me_id() THEN
    RAISE EXCEPTION 'You cannot review your own submission.';
  END IF;
  IF r.o_status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'Only a submitted item can be decided (this one is %).', r.o_status;
  END IF;
  IF p_decision = 'reject' AND v_comment IS NULL THEN
    RAISE EXCEPTION 'A reason is required to return an item.';
  END IF;
  IF p_entity = 'exam' AND p_decision = 'approve' AND NOT EXISTS (
       SELECT 1 FROM procurements.sms_tos t
       WHERE t.id = r.o_tos_id AND t.school_id IS NULL AND t.review_status = 'approved') THEN
    RAISE EXCEPTION 'This exam does not reference an approved Division TOS.';
  END IF;

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, p_decision, r.o_status,
    CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
    v_comment, r.o_created_by);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_reopen(
  p_entity TEXT, p_id BIGINT, p_comment TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  r RECORD;
  v_comment TEXT := NULLIF(btrim(p_comment), '');
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may reopen Division TOS and exams.';
  END IF;
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);
  IF r.o_status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved item can be reopened.';
  END IF;
  IF v_comment IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reopen an item.';
  END IF;
  IF NOT procurements.exam_has_approve_event(p_entity, p_id) THEN
    RAISE EXCEPTION 'This item predates QA review and has no author who can edit it; create a new one instead.';
  END IF;
  IF p_entity = 'exam' AND EXISTS (
       SELECT 1 FROM procurements.sms_exam_results x WHERE x.exam_id = p_id) THEN
    RAISE EXCEPTION 'Results have already been recorded against this exam; create a new set instead.';
  END IF;
  IF p_entity = 'tos' AND EXISTS (
       SELECT 1 FROM procurements.sms_exams e WHERE e.tos_id = p_id) THEN
    RAISE EXCEPTION 'An exam has been built on this TOS; create a new TOS instead.';
  END IF;

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'reopen', r.o_status, 'draft', v_comment, r.o_created_by);
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. Hardening: EXECUTE on every function this migration defines.
--     A new function is executable by PUBLIC (and so by anon) by default. Only
--     the policy helpers and the seven RPCs are callable, and only by a
--     signed-in user. Trigger functions need no EXECUTE grant to fire, and the
--     internal workflow pieces are reached only through the SECURITY DEFINER
--     RPCs, which run as their owner. 161's can_read_exam_paper /
--     can_manage_exam keep the grants they already had.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  procurements.exam_me_id(), procurements.exam_me_type(),
  procurements.is_exam_qa(), procurements.is_exam_oversight(),
  procurements.is_division_author(),
  procurements.can_see_division_row(TEXT, BIGINT),
  procurements.can_edit_tos(BIGINT), procurements.can_edit_exam(BIGINT),
  procurements.exam_has_approve_event(TEXT, BIGINT),
  procurements.exam_id_of_question(BIGINT),
  procurements.exam_guard_review_fields(),
  procurements.exam_guard_tos(),
  procurements.exam_guard_result_release(),
  procurements.exam_review_table(TEXT),
  procurements.exam_review_load(TEXT, BIGINT),
  procurements.exam_review_transition(TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, BIGINT),
  procurements.exam_qa_authorize(BIGINT),
  procurements.exam_qa_revoke(BIGINT, TEXT),
  procurements.exam_review_submit(TEXT, BIGINT),
  procurements.exam_review_withdraw(TEXT, BIGINT),
  procurements.exam_review_start(TEXT, BIGINT),
  procurements.exam_review_decide(TEXT, BIGINT, TEXT, TEXT),
  procurements.exam_review_reopen(TEXT, BIGINT, TEXT)
  FROM PUBLIC, anon;

-- The internal and trigger functions are callable by nobody but their owner.
-- Revoked from `authenticated` explicitly as well, because production may
-- carry default privileges (ALTER DEFAULT PRIVILEGES … GRANT EXECUTE … TO
-- authenticated) that granted it at CREATE time, which revoking PUBLIC alone
-- would leave in place.
REVOKE EXECUTE ON FUNCTION
  procurements.exam_guard_review_fields(),
  procurements.exam_guard_tos(),
  procurements.exam_guard_result_release(),
  procurements.exam_review_table(TEXT),
  procurements.exam_review_load(TEXT, BIGINT),
  procurements.exam_review_transition(TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, BIGINT)
  FROM authenticated;

GRANT EXECUTE ON FUNCTION
  procurements.exam_me_id(), procurements.exam_me_type(),
  procurements.is_exam_qa(), procurements.is_exam_oversight(),
  procurements.is_division_author(),
  procurements.can_see_division_row(TEXT, BIGINT),
  procurements.can_edit_tos(BIGINT), procurements.can_edit_exam(BIGINT),
  procurements.exam_has_approve_event(TEXT, BIGINT),
  procurements.exam_id_of_question(BIGINT),
  procurements.exam_qa_authorize(BIGINT),
  procurements.exam_qa_revoke(BIGINT, TEXT),
  procurements.exam_review_submit(TEXT, BIGINT),
  procurements.exam_review_withdraw(TEXT, BIGINT),
  procurements.exam_review_start(TEXT, BIGINT),
  procurements.exam_review_decide(TEXT, BIGINT, TEXT, TEXT),
  procurements.exam_review_reopen(TEXT, BIGINT, TEXT)
  TO authenticated, service_role;
