-- ============================================================================
-- 237 — Division authors of any role; competency access as its own grant
-- ============================================================================
--
-- Two changes to how QA hands out division authoring rights at /qa/authors.
--
-- 1. ANY ROLE MAY BE A DIVISION AUTHOR. 194 admitted only a teacher: QA could
--    authorize nobody without a teacher role (`exam_qa_authorize`), and an
--    authorized author could write a division TOS / exam / bank question only
--    while ACTING as a teacher (`is_division_author`). Both now admit any role
--    except the accounts that cannot sign in (135/158: accounting,
--    security_guard, utility_worker) and the two view-only partner accounts
--    (214 region_account, 222 sbfp_viewer). `is_division_author` is read by
--    the TOS, exam, child-table and bank-question policies of 194/195, so this
--    one body change is what opens all of them — no policy is replaced.
--    Everything else 194 established stands: rows still land as `draft`,
--    nobody reviews their own submission whichever role they act as, and only
--    the exam_review_* functions move review_status (invariant 17).
--
--    ⚠ This REVERSES 194's "the division office does not author": a
--    division_admin, division_type or QA reviewer whom QA authorizes may now
--    write division papers. Deliberate (owner decision, 2026-11-20).
--
-- 2. "CAN ADD COMPETENCIES" IS ITS OWN GRANT. 236 kept it as a column on the
--    author row, settable only for an active author and cleared on revoke, so
--    QA could not let someone add catalogue entries without also letting them
--    write division papers. It moves to `sms_competency_contributors`, granted
--    and withdrawn independently. `exam_qa_set_competency_access` keeps its
--    signature (the client calls it unchanged) and now writes the new table;
--    `can_add_catalogue_competency` reads it. Same role exclusions as (1).
--
--    The old `sms_exam_qa_authors.may_add_competencies` column is NOT dropped
--    (additive rule) but nothing reads it after this; 236's trigger that clears
--    it on revoke is left in place and is harmless.
--
-- ONLY DML: the backfill copying every author who has the 236 switch on into
-- the new table, so nobody loses access on apply. Count before applying:
--
--   SELECT count(*) FROM procurements.sms_exam_qa_authors
--   WHERE is_active AND may_add_competencies;
--
-- Functions replaced (same signatures, plain CREATE OR REPLACE):
--   is_division_author()                    — 194, body
--   exam_qa_authorize(BIGINT)               — 194, the role check only
--   exam_qa_set_competency_access(BIGINT, BOOLEAN) — 236, body
--   can_add_catalogue_competency()          — 236, body
-- Compare each with pg_get_functiondef on production before applying (116/157).
--
-- Tests: supabase/tests/237_division_authors_any_role.sql
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- Who may hold either right: any account that signs in and is not view-only.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_qa_type_may_author(p_type TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE
SET search_path = procurements, public AS $$
  SELECT p_type IS NOT NULL
     AND p_type NOT IN ('accounting', 'security_guard', 'utility_worker',
                        'region_account', 'sbfp_viewer');
$$;

CREATE OR REPLACE FUNCTION procurements.exam_qa_user_may_author(p_user_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.id = p_user_id AND u.is_active
      AND procurements.exam_qa_type_may_author(u.type));
$$;

-- ----------------------------------------------------------------------------
-- 1. Division authors of any role
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.is_division_author()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE(procurements.exam_qa_type_may_author(procurements.exam_me_type()), false)
     AND EXISTS (
       SELECT 1 FROM procurements.sms_exam_qa_authors a
       WHERE a.user_id = procurements.exam_me_id() AND a.is_active);
$$;

-- 194's body verbatim except the role check and its message.
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

  IF NOT procurements.exam_qa_user_may_author(p_user_id) THEN
    RAISE EXCEPTION 'Only an active account that can sign in, and is not view-only, can be authorized to write Division TOS.';
  END IF;

  SELECT a.id, a.is_active INTO v_id, v_prev
  FROM procurements.sms_exam_qa_authors a WHERE a.user_id = p_user_id FOR UPDATE;

  IF v_prev THEN
    RAISE EXCEPTION 'That user is already authorized.';
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

-- ----------------------------------------------------------------------------
-- 2. Competency contributors, independent of authorship
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_competency_contributors (
  user_id    BIGINT PRIMARY KEY
               REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  granted_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE procurements.sms_competency_contributors ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON procurements.sms_competency_contributors TO authenticated;

-- Same readers as 194's authors table. No write policy: only the function below.
DROP POLICY IF EXISTS "sms_competency_contributors: select"
  ON procurements.sms_competency_contributors;
CREATE POLICY "sms_competency_contributors: select"
  ON procurements.sms_competency_contributors
  FOR SELECT TO authenticated
  USING (procurements.is_exam_qa() OR procurements.is_exam_oversight()
         OR user_id = procurements.exam_me_id());

-- Nobody who has the 236 switch on today loses it.
INSERT INTO procurements.sms_competency_contributors (user_id, is_active, granted_by, granted_at)
SELECT a.user_id, true, a.authorized_by, COALESCE(a.updated_at, NOW())
FROM procurements.sms_exam_qa_authors a
WHERE a.is_active AND a.may_add_competencies
ON CONFLICT (user_id) DO NOTHING;

-- 236's signature; now grants or withdraws on its own table, author or not.
CREATE OR REPLACE FUNCTION procurements.exam_qa_set_competency_access(
  p_user_id BIGINT, p_enabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_me BIGINT := procurements.exam_me_id();
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may change who adds catalogue competencies.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_enabled, false) THEN
    IF NOT procurements.exam_qa_user_may_author(p_user_id) THEN
      RAISE EXCEPTION 'Only an active account that can sign in, and is not view-only, can add competencies.';
    END IF;
    INSERT INTO procurements.sms_competency_contributors (user_id, granted_by)
    VALUES (p_user_id, v_me)
    ON CONFLICT (user_id) DO UPDATE
      SET is_active = true, granted_by = v_me, granted_at = NOW(),
          revoked_by = NULL, revoked_at = NULL, updated_at = NOW();
  ELSE
    UPDATE procurements.sms_competency_contributors
       SET is_active = false, revoked_by = v_me, revoked_at = NOW(), updated_at = NOW()
     WHERE user_id = p_user_id AND is_active;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.can_add_catalogue_competency()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE(procurements.exam_qa_type_may_author(procurements.exam_me_type()), false)
     AND EXISTS (
       SELECT 1 FROM procurements.sms_competency_contributors c
       WHERE c.user_id = procurements.exam_me_id() AND c.is_active);
$$;

-- ----------------------------------------------------------------------------
-- Privileges (194/236 pattern: internal helpers off PUBLIC, anon)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION procurements.exam_qa_type_may_author(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.exam_qa_user_may_author(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.exam_qa_type_may_author(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.exam_qa_user_may_author(BIGINT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
