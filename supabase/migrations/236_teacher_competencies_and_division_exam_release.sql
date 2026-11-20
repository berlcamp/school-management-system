-- ============================================================================
-- 236 — Teachers add catalogue competencies; division exams are published and
--       released to a school by its school head
-- ============================================================================
--
-- PART A — Teachers may add competencies to the catalogue
--
--   195 let only the division office and QA write the competency catalogue. A
--   QA reviewer may now switch on, per authorized Division author (194), "may
--   add competencies" on /qa/authors. Such a teacher may ADD an entry — never
--   edit, retire or add a learning area — and the entry is flagged
--   `added_by_teacher`, stamped by trigger from who inserted it and never
--   changed afterwards, so the catalogue can show which entries a teacher
--   typed in.
--
--   * `sms_exam_qa_authors.may_add_competencies` BOOLEAN NOT NULL DEFAULT false.
--     Only for an ACTIVE author: revoking the authorization clears it (trigger),
--     so re-authorizing later starts with it off.
--   * `exam_qa_set_competency_access(user, enabled)` — the only writer; QA /
--     super admin, the same people who authorize (194's is_exam_qa()).
--   * `sms_competency_catalogue.added_by_teacher` BOOLEAN NOT NULL DEFAULT false.
--     Every existing entry was written by the division office, QA or the 208
--     seed, so false is true of all of them; nothing is backfilled.
--   * The catalogue INSERT policy (195) is replaced: managers as before, OR an
--     authorized author with the switch on, inserting an active entry under an
--     active learning area. UPDATE and the learning-area policies are untouched.
--
-- PART B — Division exams: shown to teachers only when published; released to
--          a school by its school head with a 6-character passcode
--
--   Until now an APPROVED division exam (194) was listed to every teacher in the
--   division at once, and its paper was sealed per TEACHER by 161's release code,
--   held by the division office and QA. Now:
--
--   * `sms_exams.is_published` BOOLEAN NOT NULL DEFAULT false (+ published_at,
--     published_by). A division exam is listed to teachers only when approved
--     AND published. Its author, QA and the division office see it regardless.
--     Only `exam_division_set_published` changes it (division_admin /
--     division_type / super admin — NOT QA), and a guard trigger refuses every
--     other write. Leaving `approved` (a reopen) unpublishes it automatically.
--   * When published, the division office may set a 6-character passcode
--     (`exam_division_set_passcode`, stored in 161's sms_exam_release_codes, so
--     the paper tables' RLS needs no change). A school head / assistant school
--     head enters it (`exam_school_unlock`) and the paper opens for EVERY user
--     whose active school is theirs — recorded in the new
--     `sms_exam_school_unlocks` (exam, school). A published exam with no
--     passcode is open to every teacher, as an ungated exam always was (161).
--   * For division exams the per-teacher unlock is retired: `exam_unlock`
--     refuses a division exam (ask your school head), `exam_set_release_code`
--     refuses one (use the division passcode), and `can_read_exam_paper` no
--     longer reads sms_exam_unlocks for a division exam. School-level and
--     private exams keep 161's per-teacher code exactly as before.
--   * `can_manage_exam` drops `qa` from its division branch: the division
--     office alone holds a division exam's code. QA still READS every division
--     paper (is_exam_qa() in can_read_exam_paper).
--   * Unpublishing keeps the passcode and the school unlocks, so republishing
--     restores them. Clearing the passcode drops the school unlocks too, so
--     re-gating later does not readmit schools that had the old code (161's
--     rule). Replacing it keeps the schools already enabled.
--
-- ⚠ WHAT MOVES ON APPLY (decided by the owner, 2026-11-20): every approved
--   division exam starts UNPUBLISHED, so it DISAPPEARS from every teacher's and
--   school head's exam list until a division user switches it on — including
--   exams a school has already printed or scanned results against (the results
--   rows stay; the exam's name no longer resolves for them). Its author, QA and
--   the division office still see it. Count before applying:
--     SELECT count(*) FROM procurements.sms_exams
--     WHERE school_id IS NULL AND review_status = 'approved';
--   and the results that point at one:
--     SELECT count(*) FROM procurements.sms_exam_results r
--     JOIN procurements.sms_exams e ON e.id = r.exam_id
--     WHERE e.school_id IS NULL AND e.review_status = 'approved';
--   Any per-teacher unlocks of a division exam (sms_exam_unlocks) stop counting;
--   they are not deleted. To see how many:
--     SELECT count(*) FROM procurements.sms_exam_unlocks x
--     JOIN procurements.sms_exams e ON e.id = x.exam_id WHERE e.school_id IS NULL;
--
-- REPLACED (bodies taken from 161/194 and checked against the local clone's
-- pg_get_functiondef — compare with production through supabase-prod-ro before
-- applying, 116/157): can_read_exam_paper, can_manage_exam, exam_unlock,
-- exam_set_release_code (same signatures); the "sms_exams: select" policy and
-- the "sms_competency_catalogue: insert" policy.
-- NEW: 2 columns + 3 columns, 1 table, 9 functions, 3 triggers. No DML.
--
-- Tests: supabase/tests/236_teacher_competencies_and_division_release.sql
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- PART A
-- ============================================================================

ALTER TABLE procurements.sms_exam_qa_authors
  ADD COLUMN IF NOT EXISTS may_add_competencies BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE procurements.sms_competency_catalogue
  ADD COLUMN IF NOT EXISTS added_by_teacher BOOLEAN NOT NULL DEFAULT false;

-- Revoking an author clears the switch, so re-authorizing starts with it off.
CREATE OR REPLACE FUNCTION procurements.exam_qa_author_clear_access()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = procurements, public AS $$
BEGIN
  IF NOT NEW.is_active THEN
    NEW.may_add_competencies := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_exam_qa_authors_clear_access ON procurements.sms_exam_qa_authors;
CREATE TRIGGER sms_exam_qa_authors_clear_access
  BEFORE INSERT OR UPDATE ON procurements.sms_exam_qa_authors
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_qa_author_clear_access();

-- The only writer of may_add_competencies (the table has no write policy).
CREATE OR REPLACE FUNCTION procurements.exam_qa_set_competency_access(
  p_user_id BIGINT, p_enabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may change who adds catalogue competencies.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE procurements.sms_exam_qa_authors
     SET may_add_competencies = COALESCE(p_enabled, false), updated_at = NOW()
   WHERE user_id = p_user_id AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authorize the teacher first — only an authorized author may add competencies.';
  END IF;
END;
$$;

-- An authorized Division author (194, active teacher role) with the switch on.
CREATE OR REPLACE FUNCTION procurements.can_add_catalogue_competency()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_division_author()
     AND EXISTS (
       SELECT 1 FROM procurements.sms_exam_qa_authors a
       WHERE a.user_id = procurements.exam_me_id()
         AND a.is_active AND a.may_add_competencies);
$$;

-- added_by_teacher is decided by who inserts, never by the client, and is
-- frozen afterwards. A seed or service-role insert (no signed-in user) is not a
-- teacher's.
CREATE OR REPLACE FUNCTION procurements.catalogue_stamp_teacher()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_me BIGINT := procurements.exam_me_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.added_by_teacher := v_me IS NOT NULL AND NOT procurements.can_manage_catalogue();
    IF NEW.added_by_teacher THEN
      NEW.created_by := v_me;
    END IF;
  ELSE
    NEW.added_by_teacher := OLD.added_by_teacher;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_competency_catalogue_stamp_teacher ON procurements.sms_competency_catalogue;
CREATE TRIGGER sms_competency_catalogue_stamp_teacher
  BEFORE INSERT OR UPDATE ON procurements.sms_competency_catalogue
  FOR EACH ROW EXECUTE FUNCTION procurements.catalogue_stamp_teacher();

DROP POLICY IF EXISTS "sms_competency_catalogue: insert" ON procurements.sms_competency_catalogue;
CREATE POLICY "sms_competency_catalogue: insert" ON procurements.sms_competency_catalogue
  FOR INSERT TO authenticated
  WITH CHECK (
    procurements.can_manage_catalogue()
    OR (procurements.can_add_catalogue_competency()
        AND is_active
        AND EXISTS (
          SELECT 1 FROM procurements.sms_learning_areas la
          WHERE la.id = learning_area_id AND la.is_active)));

-- ============================================================================
-- PART B
-- ============================================================================

ALTER TABLE procurements.sms_exams
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by BIGINT
    REFERENCES procurements.sms_users(id) ON DELETE SET NULL;

ALTER TABLE procurements.sms_exams
  DROP CONSTRAINT IF EXISTS sms_exams_published_division_only;
ALTER TABLE procurements.sms_exams
  ADD CONSTRAINT sms_exams_published_division_only
  CHECK (NOT is_published OR (school_id IS NULL AND review_status = 'approved'));

-- Schools whose head has entered a division exam's passcode.
CREATE TABLE IF NOT EXISTS procurements.sms_exam_school_unlocks (
  exam_id     BIGINT NOT NULL REFERENCES procurements.sms_exams(id) ON DELETE CASCADE,
  school_id   BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  unlocked_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exam_id, school_id)
);
CREATE INDEX IF NOT EXISTS idx_sms_exam_school_unlocks_school
  ON procurements.sms_exam_school_unlocks (school_id);

ALTER TABLE procurements.sms_exam_school_unlocks ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON procurements.sms_exam_school_unlocks TO authenticated;
-- Read: the division office and QA (every school), anyone else their ACTIVE
-- school's rows only (invariant 13). Written only by the functions below.
DROP POLICY IF EXISTS "sms_exam_school_unlocks: select" ON procurements.sms_exam_school_unlocks;
CREATE POLICY "sms_exam_school_unlocks: select" ON procurements.sms_exam_school_unlocks
  FOR SELECT TO authenticated
  USING (procurements.is_exam_oversight() OR procurements.is_exam_qa()
         OR school_id = (SELECT u.school_id FROM procurements.sms_users u
                         WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1));

-- is_published moves only through exam_division_set_published, and never
-- survives the exam leaving `approved`.
CREATE OR REPLACE FUNCTION procurements.exam_guard_published()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = procurements, public AS $$
BEGIN
  IF current_setting('sms.exam_publish', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_published := false;
      NEW.published_at := NULL;
      NEW.published_by := NULL;
    ELSIF NEW.is_published IS DISTINCT FROM OLD.is_published
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR (NEW.published_by IS DISTINCT FROM OLD.published_by
           AND NEW.published_by IS NOT NULL) THEN
      RAISE EXCEPTION 'A division exam is shown to teachers only by the division office.';
    END IF;
  END IF;
  IF NEW.is_published AND NEW.review_status IS DISTINCT FROM 'approved' THEN
    NEW.is_published := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_exams_guard_published ON procurements.sms_exams;
CREATE TRIGGER sms_exams_guard_published
  BEFORE INSERT OR UPDATE ON procurements.sms_exams
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_published();

-- 194's can_see_division_row, plus the published flag. sms_tos keeps 194's.
CREATE OR REPLACE FUNCTION procurements.can_see_division_exam(
  p_status TEXT, p_created_by BIGINT, p_published BOOLEAN)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT (p_status = 'approved' AND p_published)
      OR p_created_by = procurements.exam_me_id()
      OR procurements.is_exam_qa()
      OR procurements.is_exam_oversight();
$$;

DROP POLICY IF EXISTS "sms_exams: select" ON procurements.sms_exams;
CREATE POLICY "sms_exams: select" ON procurements.sms_exams
  FOR SELECT TO authenticated
  USING (school_id IS NOT NULL
         OR procurements.can_see_division_exam(review_status, created_by, is_published));

-- 194's can_manage_exam, with `qa` removed from the division branch.
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
          AND me.type IN ('division_admin', 'super admin', 'division_type'))
        OR (e.school_id IS NOT NULL AND me.id = e.created_by)
        OR (e.school_id IS NOT NULL
            AND e.is_school_shared
            AND me.school_id = e.school_id
            AND me.type IN ('school_head', 'assistant_school_head', 'admin'))
      )
  );
$$;

COMMENT ON FUNCTION procurements.can_manage_exam IS
  'True when the signed-in user may set, read or clear this exam''s release code: for an APPROVED division exam the division office (236; QA no longer); for a school-level exam its author, plus school_head / assistant_school_head / admin at the school for a school-wide exam (160).';

-- 194's can_read_exam_paper; the division branch is new, the school-level tail
-- is verbatim.
CREATE OR REPLACE FUNCTION procurements.can_read_exam_paper(p_exam_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_school    BIGINT;
  v_status    TEXT;
  v_author    BIGINT;
  v_published BOOLEAN;
BEGIN
  SELECT e.school_id, e.review_status, e.created_by, e.is_published
    INTO v_school, v_status, v_author, v_published
  FROM procurements.sms_exams e WHERE e.id = p_exam_id;

  IF FOUND AND v_school IS NULL THEN
    IF procurements.is_exam_qa() OR procurements.is_exam_oversight() THEN
      RETURN true;
    END IF;
    IF v_status <> 'approved' THEN
      RETURN v_author = procurements.exam_me_id();
    END IF;
    IF NOT v_published THEN
      RETURN false;
    END IF;
    RETURN NOT EXISTS (
        SELECT 1 FROM procurements.sms_exam_release_codes c
        WHERE c.exam_id = p_exam_id)
      OR EXISTS (
        SELECT 1
        FROM procurements.sms_exam_school_unlocks s
        JOIN procurements.sms_users u
          ON u.school_id = s.school_id AND u.user_id = auth.uid() AND u.is_active
        WHERE s.exam_id = p_exam_id);
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

-- 161's exam_unlock, refusing a division exam (its school head enables it).
CREATE OR REPLACE FUNCTION procurements.exam_unlock(
  p_exam_id BIGINT,
  p_code    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_me    BIGINT;
  v_ok    BOOLEAN;
  v_given TEXT := upper(btrim(coalesce(p_code, '')));
BEGIN
  SELECT u.id INTO v_me
  FROM procurements.sms_users u WHERE u.user_id = auth.uid() LIMIT 1;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No staff record for the signed-in account.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM procurements.sms_exams e
             WHERE e.id = p_exam_id AND e.school_id IS NULL) THEN
    RAISE EXCEPTION 'A division exam is enabled for your whole school by your school head.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_exam_release_codes c
    WHERE c.exam_id = p_exam_id AND c.code = v_given
  ) INTO v_ok;

  IF NOT v_ok THEN
    RETURN false;
  END IF;

  INSERT INTO procurements.sms_exam_unlocks (exam_id, user_id)
  VALUES (p_exam_id, v_me)
  ON CONFLICT (exam_id, user_id) DO NOTHING;

  RETURN true;
END;
$$;

-- 161's exam_set_release_code, refusing a division exam.
CREATE OR REPLACE FUNCTION procurements.exam_set_release_code(
  p_exam_id BIGINT,
  p_code    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_me   BIGINT;
  v_code TEXT := upper(btrim(coalesce(p_code, '')));
BEGIN
  IF NOT procurements.can_manage_exam(p_exam_id) THEN
    RAISE EXCEPTION 'You may not set the release code for this exam.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM procurements.sms_exams e
             WHERE e.id = p_exam_id AND e.school_id IS NULL) THEN
    RAISE EXCEPTION 'A division exam is released with its school passcode.'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO v_me
  FROM procurements.sms_users u WHERE u.user_id = auth.uid() LIMIT 1;

  IF v_code = '' THEN
    DELETE FROM procurements.sms_exam_release_codes WHERE exam_id = p_exam_id;
    DELETE FROM procurements.sms_exam_unlocks       WHERE exam_id = p_exam_id;
    RETURN;
  END IF;

  IF length(v_code) < 4 OR length(v_code) > 32 THEN
    RAISE EXCEPTION 'A release code must be 4 to 32 characters.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO procurements.sms_exam_release_codes (exam_id, code, created_by)
  VALUES (p_exam_id, v_code, v_me)
  ON CONFLICT (exam_id) DO UPDATE
    SET code = EXCLUDED.code, created_by = EXCLUDED.created_by;
END;
$$;

-- Locks and checks an approved division exam for a division-office action.
CREATE OR REPLACE FUNCTION procurements.exam_division_release_load(p_exam_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_school    BIGINT;
  v_status    TEXT;
  v_published BOOLEAN;
BEGIN
  IF NOT procurements.is_exam_oversight() THEN
    RAISE EXCEPTION 'Only the division office may release a division exam.'
      USING ERRCODE = '42501';
  END IF;
  SELECT e.school_id, e.review_status, e.is_published
    INTO v_school, v_status, v_published
  FROM procurements.sms_exams e WHERE e.id = p_exam_id FOR UPDATE;
  IF NOT FOUND OR v_school IS NOT NULL THEN
    RAISE EXCEPTION 'That is not a division exam.';
  END IF;
  IF v_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Only an approved division exam can be shown to teachers.';
  END IF;
  RETURN v_published;
END;
$$;

-- Show / hide an approved division exam for every teacher in the division.
CREATE OR REPLACE FUNCTION procurements.exam_division_set_published(
  p_exam_id BIGINT, p_published BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  PERFORM procurements.exam_division_release_load(p_exam_id);
  PERFORM set_config('sms.exam_publish', 'on', true);
  UPDATE procurements.sms_exams
     SET is_published = COALESCE(p_published, false),
         published_at = CASE WHEN p_published THEN NOW() ELSE published_at END,
         published_by = CASE WHEN p_published THEN procurements.exam_me_id() ELSE published_by END
   WHERE id = p_exam_id;
  PERFORM set_config('sms.exam_publish', 'off', true);
END;
$$;

-- Set or replace the 6-character passcode (published exams only), or clear it
-- with '' / NULL, which also drops every school unlock.
CREATE OR REPLACE FUNCTION procurements.exam_division_set_passcode(
  p_exam_id BIGINT, p_code TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_published BOOLEAN := procurements.exam_division_release_load(p_exam_id);
  v_code      TEXT := upper(btrim(coalesce(p_code, '')));
BEGIN
  IF v_code = '' THEN
    DELETE FROM procurements.sms_exam_release_codes  WHERE exam_id = p_exam_id;
    DELETE FROM procurements.sms_exam_school_unlocks WHERE exam_id = p_exam_id;
    RETURN;
  END IF;
  IF NOT v_published THEN
    RAISE EXCEPTION 'Show the exam to all teachers before setting its passcode.';
  END IF;
  IF v_code !~ '^[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'A school passcode is exactly 6 letters or digits.'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO procurements.sms_exam_release_codes (exam_id, code, created_by)
  VALUES (p_exam_id, v_code, procurements.exam_me_id())
  ON CONFLICT (exam_id) DO UPDATE
    SET code = EXCLUDED.code, created_by = EXCLUDED.created_by;
END;
$$;

-- A school head enters the passcode: the paper opens for their active school.
-- FALSE for a wrong code, which tells the caller nothing else (161).
CREATE OR REPLACE FUNCTION procurements.exam_school_unlock(
  p_exam_id BIGINT, p_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_me     BIGINT;
  v_type   TEXT;
  v_school BIGINT;
  v_given  TEXT := upper(btrim(coalesce(p_code, '')));
BEGIN
  SELECT u.id, u.type, u.school_id INTO v_me, v_type, v_school
  FROM procurements.sms_users u WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1;

  IF v_me IS NULL OR v_school IS NULL
     OR v_type NOT IN ('school_head', 'assistant_school_head') THEN
    RAISE EXCEPTION 'Only a school head enables a division exam for the school.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM procurements.sms_exams e
                 WHERE e.id = p_exam_id AND e.school_id IS NULL
                   AND e.review_status = 'approved' AND e.is_published) THEN
    RAISE EXCEPTION 'That exam is not available to schools.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM procurements.sms_exam_release_codes c
                 WHERE c.exam_id = p_exam_id AND c.code = v_given) THEN
    RETURN false;
  END IF;

  INSERT INTO procurements.sms_exam_school_unlocks (exam_id, school_id, unlocked_by)
  VALUES (p_exam_id, v_school, v_me)
  ON CONFLICT (exam_id, school_id) DO NOTHING;
  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- Privileges. Trigger and internal functions are not callable by clients
-- (194: production's default privileges may grant `authenticated`).
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION procurements.exam_qa_author_clear_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.catalogue_stamp_teacher() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.exam_guard_published() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.exam_division_release_load(BIGINT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION procurements.exam_qa_set_competency_access(BIGINT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.can_add_catalogue_competency() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.can_see_division_exam(TEXT, BIGINT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.exam_division_set_published(BIGINT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.exam_division_set_passcode(BIGINT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.exam_school_unlock(BIGINT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION procurements.exam_qa_set_competency_access(BIGINT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.can_add_catalogue_competency() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.can_see_division_exam(TEXT, BIGINT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.exam_division_set_published(BIGINT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.exam_division_set_passcode(BIGINT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.exam_school_unlock(BIGINT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
