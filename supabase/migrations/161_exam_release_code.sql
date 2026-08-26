-- ============================================================================
-- Migration 161: the exam release code
-- ============================================================================
--
-- APPLY AFTER 099_exam_creator, 100_exam_sections, 132_exam_answer_keys_and_
-- scanning and 160_school_shared_tos_and_exams.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
--
-- A periodical test is written weeks before it is sat, and from the moment it
-- is authored here every teacher who can see it can also print it. The division
-- office (or a school head, for a school-wide exam) has no way to say "you may
-- have the paper on Monday" — the paper is simply there, and the only control
-- is to not author the exam in this system until the last minute, which is the
-- opposite of what the module is for.
--
-- A release code is the digital form of the sealed envelope the division
-- already couriers to schools. The exam's manager sets a code; nobody else can
-- open the paper or the answer sheets until they are given it; the manager
-- hands it out on the day they choose.
--
-- ---------------------------------------------------------------------------
-- This is enforced in the DATABASE, and that is the whole point
-- ---------------------------------------------------------------------------
--
-- Everything else in this module scopes in the app layer (096/099's headers say
-- so, and 160 repeats it). That is fine for "whose TOS is this" and useless
-- here: the anon key ships in the browser bundle, so a gate that only hides a
-- button is lifted by anyone who opens the developer tools, and a lock that a
-- curious teacher can pick is not a lock. So this migration does three things
-- that the rest of the module deliberately does not:
--
--   1. the code lives in its own table with RLS ON and NO POLICIES AT ALL, so
--      PostgREST cannot read or write it under any role. Only the SECURITY
--      DEFINER functions below touch it. The access decision therefore sits in
--      one readable guard rather than spread across policies — the 156/157
--      lesson;
--   2. `exam_unlock` compares the code server-side, so the plaintext is never
--      shipped to a client that has not already been given it;
--   3. the SELECT policies on the five tables that make up the PAPER are
--      replaced with ones that call `can_read_exam_paper`. The client queries
--      are unchanged and simply return nothing until the caller unlocks, which
--      is why no component had to be rewritten to fetch through an RPC.
--
-- The exam HEADER (sms_exams) stays readable: a teacher must be able to see
-- that the exam exists, and which one they are entering a code for.
--
-- ---------------------------------------------------------------------------
-- Nothing changes until somebody sets a code
-- ---------------------------------------------------------------------------
--
-- `can_read_exam_paper` returns TRUE when no code is set, so every exam that
-- exists today — and every exam authored later without one — behaves exactly as
-- it does now. The gate is opt-in per exam, and clearing the code reverts that
-- exam completely without a migration. This is the same load-bearing default as
-- 153 and 160.
--
-- Who is never gated:
--   * the exam's manager (see can_manage_exam) — they hold the code;
--   * division_admin / super admin / division_type — they oversee every school
--     and already read every result; gating them would break the division Item
--     Analysis view of a school's exam without protecting anything.
--
-- Who IS gated, deliberately: a school head, for a DIVISION exam. That is the
-- case the feature exists for — the division releases to the school on its own
-- schedule, and a school head who could open the paper early would be the leak.
--
-- Known rough edge, written down rather than worked around: a school head
-- opening the Item Analysis of a teacher's *private, gated* exam sees an empty
-- item grid until they too are given the code. That exam is private to that
-- teacher by definition (160), so this is the tier behaving as designed rather
-- than a bug, but it is the one place the gate is visible where nobody expected
-- a gate.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- Creates 2 tables and 5 functions. REPLACES the SELECT policy on
-- sms_exam_questions, sms_exam_options, sms_exam_subitems, sms_exam_sections
-- and sms_exam_answer_keys — five policies, all of which currently read
-- `auth.role() = 'authenticated'` and none of which is referenced by name
-- anywhere else. INSERT / UPDATE / DELETE on those tables are untouched, so
-- authoring is unaffected. No column is added to an existing table, no trigger
-- is replaced, and there is NO DML. Idempotent; re-running is a no-op.
--
-- ⚠ This TIGHTENS what an authenticated user may read, which is the point. It
-- can only tighten it for an exam that has a release code, and no exam has one
-- until somebody sets it — so on apply, nothing is refused that was allowed a
-- minute earlier. Count of currently gated exams, before and after, is zero:
--   SELECT count(*) FROM procurements.sms_exam_release_codes;
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. The code, in a table nothing can read
--
--    RLS is enabled and NO policy is created, which under RLS means every
--    PostgREST role is refused every operation. No GRANT is issued either.
--    `code` is stored in plaintext on purpose: the manager has to be able to
--    read it back a week later to hand it out, and a hash cannot do that. It is
--    protected by being unreachable, not by being scrambled — see the note on
--    exam_get_release_code below.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_release_codes (
  exam_id    BIGINT PRIMARY KEY REFERENCES procurements.sms_exams(id) ON DELETE CASCADE,
  code       TEXT NOT NULL CHECK (length(btrim(code)) BETWEEN 4 AND 32),
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_exam_release_codes IS
  'One release code per gated exam. RLS on with NO policies: unreachable through PostgREST by design; only the SECURITY DEFINER functions in migration 161 read or write it. A row existing IS what gates the exam.';

ALTER TABLE procurements.sms_exam_release_codes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_sms_exam_release_codes_updated_at
  ON procurements.sms_exam_release_codes;
CREATE TRIGGER update_sms_exam_release_codes_updated_at
  BEFORE UPDATE ON procurements.sms_exam_release_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. Who has been let in
--
--    An unlock is per (exam, user) and PERMANENT. It is a record that this
--    person was given the code, not a session: a teacher who unlocks to print
--    on Monday must still be able to scan on Friday without being handed the
--    code again, and re-entering it every login would drive the code onto a
--    sticky note beside the monitor. Readable by the row's owner and by anyone
--    who may manage the exam, so a manager can see who has taken the paper.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_unlocks (
  id          BIGSERIAL PRIMARY KEY,
  exam_id     BIGINT NOT NULL REFERENCES procurements.sms_exams(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, user_id)
);

COMMENT ON TABLE procurements.sms_exam_unlocks IS
  'One row per person who has entered an exam''s release code. Permanent, not a session: unlocking to print must still hold when the same teacher scans days later.';

CREATE INDEX IF NOT EXISTS idx_sms_exam_unlocks_exam
  ON procurements.sms_exam_unlocks(exam_id);

ALTER TABLE procurements.sms_exam_unlocks ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. can_manage_exam — the one place "who owns this exam" is written down
--
--    Mirrors what ExamList already offers as an Edit action, plus the school
--    head for the school-wide tier that 160 introduced:
--
--      division exam (school_id NULL) -> division_admin / super admin /
--                                        division_type
--      school-wide exam               -> the author, or school_head /
--                                        assistant_school_head / admin AT THAT
--                                        SCHOOL
--      private exam                   -> the author, and nobody else
--
--    SECURITY DEFINER because it is called from policies on tables the caller
--    is being judged against, and reads sms_exams — which the caller can read
--    anyway, so this hands out nothing new. search_path is pinned: a SECURITY
--    DEFINER function without one can be redirected by a caller-set search_path
--    (the 138 fix).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.can_manage_exam(p_exam_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
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
        -- The division office manages the division's own exams.
        (e.school_id IS NULL
          AND me.type IN ('division_admin', 'super admin', 'division_type'))
        -- The author manages their own, at either school-level tier.
        OR me.id = e.created_by
        -- A school-wide exam is additionally the school's to manage.
        OR (e.school_id IS NOT NULL
            AND e.is_school_shared
            AND me.school_id = e.school_id
            AND me.type IN ('school_head', 'assistant_school_head', 'admin'))
      )
  );
$$;

COMMENT ON FUNCTION procurements.can_manage_exam IS
  'True when the signed-in user may set, read or clear this exam''s release code: division roles for a division exam, the author always, and school_head / assistant_school_head / admin at the school for a school-wide exam (160).';

GRANT EXECUTE ON FUNCTION procurements.can_manage_exam(BIGINT)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. can_read_exam_paper — the gate itself
--
--    Ungated is the default and the common case, so it is tested first and
--    costs one index lookup on a table that is empty until a school opts in.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.can_read_exam_paper(p_exam_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT
    -- No code set: this exam is not gated at all. Every exam authored before
    -- migration 161, and every one authored without a code after it.
    NOT EXISTS (
      SELECT 1 FROM procurements.sms_exam_release_codes c
      WHERE c.exam_id = p_exam_id
    )
    -- The division office is never gated: it oversees every school, already
    -- reads every result, and its Item Analysis view of a school's exam would
    -- otherwise break while protecting nothing.
    OR EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin', 'super admin', 'division_type')
    )
    -- Whoever holds the code.
    OR procurements.can_manage_exam(p_exam_id)
    -- Whoever has been given it.
    OR EXISTS (
      SELECT 1
      FROM procurements.sms_exam_unlocks x
      JOIN procurements.sms_users u ON u.id = x.user_id
      WHERE x.exam_id = p_exam_id AND u.user_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION procurements.can_read_exam_paper IS
  'True when the signed-in user may read this exam''s questions, choices, sub-items, directions and answer key. TRUE for every exam with no release code, so nothing is gated until a manager sets one.';

GRANT EXECUTE ON FUNCTION procurements.can_read_exam_paper(BIGINT)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Setting, reading, clearing and redeeming the code
-- ----------------------------------------------------------------------------

-- Set or replace the code. Passing NULL / '' CLEARS the gate, which is the
-- documented way back out: the exam becomes ungated and every unlock for it is
-- dropped, so re-gating later starts clean rather than silently admitting
-- everybody who had the old code.
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

COMMENT ON FUNCTION procurements.exam_set_release_code IS
  'Manager-only. Sets or replaces an exam''s release code (stored upper-cased and trimmed). An empty code clears the gate AND every unlock, so re-gating later does not silently readmit holders of the old code.';

GRANT EXECUTE ON FUNCTION procurements.exam_set_release_code(BIGINT, TEXT)
  TO authenticated, service_role;

-- Read the code back. This is the ONLY way the plaintext ever leaves the
-- database, and it refuses anyone who is not a manager — which is what makes
-- storing it unhashed defensible.
CREATE OR REPLACE FUNCTION procurements.exam_get_release_code(p_exam_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NOT procurements.can_manage_exam(p_exam_id) THEN
    RAISE EXCEPTION 'You may not read the release code for this exam.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.code INTO v_code
  FROM procurements.sms_exam_release_codes c WHERE c.exam_id = p_exam_id;

  RETURN v_code;  -- NULL when the exam is not gated
END;
$$;

COMMENT ON FUNCTION procurements.exam_get_release_code IS
  'Manager-only. Returns the exam''s release code so it can be handed out, or NULL when the exam is not gated. The only path by which the plaintext leaves the database.';

GRANT EXECUTE ON FUNCTION procurements.exam_get_release_code(BIGINT)
  TO authenticated, service_role;

-- Redeem a code. Compared server-side, so a wrong guess learns nothing and the
-- real code is never sent to a client that does not already have it.
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

COMMENT ON FUNCTION procurements.exam_unlock IS
  'Redeem an exam release code. Returns TRUE and records a permanent unlock for the caller, or FALSE for a wrong code — which tells the caller nothing else.';

GRANT EXECUTE ON FUNCTION procurements.exam_unlock(BIGINT, TEXT)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. sms_exam_unlocks policies
--
--    Written only through exam_unlock (SECURITY DEFINER, so it runs past RLS);
--    readable so the UI can tell a teacher they are already unlocked and show a
--    manager who has taken the paper. No INSERT / UPDATE / DELETE policy: a
--    client must not be able to grant itself an unlock.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sms_exam_unlocks: select" ON procurements.sms_exam_unlocks;
CREATE POLICY "sms_exam_unlocks: select" ON procurements.sms_exam_unlocks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.id = sms_exam_unlocks.user_id AND u.user_id = auth.uid()
    )
    OR procurements.can_manage_exam(sms_exam_unlocks.exam_id)
  );

GRANT SELECT ON procurements.sms_exam_unlocks TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. The gate on the paper
--
--    Replaces five SELECT policies that all read `auth.role() = 'authenticated'`
--    with ones that additionally require can_read_exam_paper. INSERT / UPDATE /
--    DELETE are deliberately untouched: authoring already answers to the app's
--    own ownership rules, and a builder that could write a question it cannot
--    read back would be a worse bug than the one being fixed.
--
--    sms_exams itself is NOT gated — the teacher has to see that the exam
--    exists in order to enter its code.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t   TEXT;
  fk  TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_exam_questions', 'sms_exam_sections', 'sms_exam_answer_keys',
    'sms_exam_options',   'sms_exam_subitems'
  ] LOOP
    -- The first three carry exam_id; options and subitems hang off a question.
    fk := CASE
      WHEN t IN ('sms_exam_options', 'sms_exam_subitems')
      THEN format(
             '(SELECT q.exam_id FROM procurements.sms_exam_questions q'
             ' WHERE q.id = %I.question_id)', t)
      ELSE format('%I.exam_id', t)
    END;

    EXECUTE format('DROP POLICY IF EXISTS "%1$s: select" ON procurements.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "%1$s: select" ON procurements.%1$s
         FOR SELECT TO authenticated
         USING (procurements.can_read_exam_paper(%2$s))', t, fk);
  END LOOP;
END $$;
