-- ============================================================================
-- 123. Instructional Supervision — real RLS, plus the integrity repairs 121
--      declared but did not deliver.
--
-- 121 shipped every one of its seven tables with
--
--     USING (auth.role() = 'authenticated')
--
-- citing the 105/119 precedent. Those tables hold rosters and tags. These hold
-- COT ratings — the evidence behind a teacher's RPMS score — and a formal
-- approval gate. With no middleware in this app, every rule in the module was
-- a client-side suggestion: from the browser console any signed-in user could
-- self-approve their own observation, rewrite another observer's submitted
-- rating sheet, or read and write another school's supervision records.
--
-- This migration:
--   1. re-creates 121's six triggers idempotently, so the file can be re-run
--      after a partial apply (121 used bare CREATE TRIGGER and aborts on 42710)
--   2. replaces the blanket policies with school-scoped ones, and observer
--      ownership on the two tables that carry ratings
--   3. protects the decision columns with a trigger, so only supervision staff
--      can approve or reject
--   4. school-scopes the storage policies from 122, whose paths are per-school
--      but whose policies were not
--   5. repairs the FK delete rules that would abort or silently destroy
--      signed forms
--
-- Idempotent throughout: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Make 121's triggers re-runnable
--
-- Every other statement in 121 is guarded. These six were not, which meant a
-- 121 that failed partway could not be recovered by re-running it. Follows the
-- 118 precedent.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_supervision_observers',
    'sms_supervision_plans',
    'sms_supervision_plan_entries',
    'sms_supervision_schedules',
    'sms_cot_observations',
    'sms_cot_ratings'
  ] LOOP
    IF to_regclass('procurements.' || t) IS NOT NULL THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS update_%1$s_updated_at ON procurements.%1$s', t);
      EXECUTE format(
        'CREATE TRIGGER update_%1$s_updated_at
           BEFORE UPDATE ON procurements.%1$s
           FOR EACH ROW EXECUTE FUNCTION procurements.update_updated_at_column()', t);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Who is asking?
--
-- SECURITY DEFINER so a policy can resolve the caller without depending on
-- sms_users' own RLS (and without the recursion that would invite). search_path
-- is pinned, which is what makes SECURITY DEFINER safe here.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_actor_id()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION procurements.sms_actor_school_id()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1;
$$;

/**
 * Division-wide roles. `super admin` is here per the 113/115 precedent: an
 * override swaps their active school, so pinning them to one school_id would
 * lock them out of the very thing the override exists for.
 */
CREATE OR REPLACE FUNCTION procurements.sms_actor_is_division()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT COALESCE(
    (SELECT type IN ('division_admin', 'super admin')
       FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1),
    FALSE);
$$;

/** Who may run the supervision cycle: write plans, designate observers, decide. */
CREATE OR REPLACE FUNCTION procurements.sms_actor_is_supervision_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT COALESCE(
    (SELECT type IN ('school_head', 'assistant_school_head', 'admin',
                     'super admin', 'division_admin')
       FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1),
    FALSE);
$$;

/** True when the caller may see/touch rows belonging to `target_school`. */
CREATE OR REPLACE FUNCTION procurements.sms_supervision_in_scope(target_school BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = procurements, public
AS $$
  SELECT procurements.sms_actor_is_division()
      OR (target_school IS NOT NULL
          AND target_school = procurements.sms_actor_school_id());
$$;

GRANT EXECUTE ON FUNCTION procurements.sms_actor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sms_actor_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sms_actor_is_division() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sms_actor_is_supervision_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sms_supervision_in_scope(BIGINT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Replace the blanket policies
--
-- Read stays school-wide: a supervisory plan and the observation board are
-- meant to be visible to the school's staff, and the app already filters to
-- what each view should show. Write is where the rules bite.
-- ----------------------------------------------------------------------------

-- Drop this migration's own policy names too, so it is genuinely re-runnable
-- and not merely re-runnable against 121's output.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_supervision_observers',
    'sms_supervision_plans',
    'sms_supervision_plan_entries',
    'sms_supervision_schedules',
    'sms_supervision_schedule_observers',
    'sms_cot_observations',
    'sms_cot_ratings'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: write" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: select" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: insert" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: update" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: delete" ON procurements.%1$s', t);
  END LOOP;
END $$;

-- 2a. Tables that carry school_id directly.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_supervision_observers',
    'sms_supervision_plans',
    'sms_supervision_schedules',
    'sms_cot_observations'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: select" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: insert" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: update" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: delete" ON procurements.%1$s', t);

    EXECUTE format(
      'CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT
         USING (procurements.sms_supervision_in_scope(school_id))', t);
  END LOOP;
END $$;

-- Observers and plans are the School Head's to maintain.
CREATE POLICY "sms_supervision_observers: write"
  ON procurements.sms_supervision_observers FOR ALL
  USING (
    procurements.sms_supervision_in_scope(school_id)
    AND procurements.sms_actor_is_supervision_staff()
  )
  WITH CHECK (
    procurements.sms_supervision_in_scope(school_id)
    AND procurements.sms_actor_is_supervision_staff()
  );

CREATE POLICY "sms_supervision_plans: write"
  ON procurements.sms_supervision_plans FOR ALL
  USING (
    procurements.sms_supervision_in_scope(school_id)
    AND procurements.sms_actor_is_supervision_staff()
  )
  WITH CHECK (
    procurements.sms_supervision_in_scope(school_id)
    AND procurements.sms_actor_is_supervision_staff()
  );

-- A teacher may suggest a slot for themselves; staff may act on any slot.
-- The decision columns are policed separately, by trigger (section 3).
CREATE POLICY "sms_supervision_schedules: insert"
  ON procurements.sms_supervision_schedules FOR INSERT
  WITH CHECK (
    procurements.sms_supervision_in_scope(school_id)
    AND (
      procurements.sms_actor_is_supervision_staff()
      OR teacher_id = procurements.sms_actor_id()
    )
  );

CREATE POLICY "sms_supervision_schedules: update"
  ON procurements.sms_supervision_schedules FOR UPDATE
  USING (
    procurements.sms_supervision_in_scope(school_id)
    AND (
      procurements.sms_actor_is_supervision_staff()
      OR teacher_id = procurements.sms_actor_id()
      OR EXISTS (
        SELECT 1 FROM procurements.sms_supervision_schedule_observers so
        WHERE so.schedule_id = sms_supervision_schedules.id
          AND so.user_id = procurements.sms_actor_id()
      )
    )
  )
  WITH CHECK (procurements.sms_supervision_in_scope(school_id));

CREATE POLICY "sms_supervision_schedules: delete"
  ON procurements.sms_supervision_schedules FOR DELETE
  USING (
    procurements.sms_supervision_in_scope(school_id)
    AND procurements.sms_actor_is_supervision_staff()
  );

-- The sharp one: a COT form belongs to the observer whose name is on it.
-- Staff may correct any form; an observer may touch only their own; the rated
-- teacher may touch none. `kind = 'agreement'` carries no observer_id, so it is
-- restricted to the observers actually assigned to that slot.
CREATE POLICY "sms_cot_observations: insert"
  ON procurements.sms_cot_observations FOR INSERT
  WITH CHECK (
    procurements.sms_supervision_in_scope(school_id)
    AND (
      procurements.sms_actor_is_supervision_staff()
      OR observer_id = procurements.sms_actor_id()
      OR (
        kind = 'agreement'
        AND EXISTS (
          SELECT 1 FROM procurements.sms_supervision_schedule_observers so
          WHERE so.schedule_id = sms_cot_observations.schedule_id
            AND so.user_id = procurements.sms_actor_id()
        )
      )
    )
  );

CREATE POLICY "sms_cot_observations: update"
  ON procurements.sms_cot_observations FOR UPDATE
  USING (
    procurements.sms_supervision_in_scope(school_id)
    AND (
      procurements.sms_actor_is_supervision_staff()
      OR observer_id = procurements.sms_actor_id()
      OR (
        kind = 'agreement'
        AND EXISTS (
          SELECT 1 FROM procurements.sms_supervision_schedule_observers so
          WHERE so.schedule_id = sms_cot_observations.schedule_id
            AND so.user_id = procurements.sms_actor_id()
        )
      )
    )
  )
  WITH CHECK (procurements.sms_supervision_in_scope(school_id));

CREATE POLICY "sms_cot_observations: delete"
  ON procurements.sms_cot_observations FOR DELETE
  USING (
    procurements.sms_supervision_in_scope(school_id)
    AND (
      procurements.sms_actor_is_supervision_staff()
      OR observer_id = procurements.sms_actor_id()
    )
  );

-- 2b. Child tables, scoped through their parent.
DROP POLICY IF EXISTS "sms_supervision_plan_entries: select"
  ON procurements.sms_supervision_plan_entries;
DROP POLICY IF EXISTS "sms_supervision_plan_entries: insert"
  ON procurements.sms_supervision_plan_entries;
DROP POLICY IF EXISTS "sms_supervision_plan_entries: update"
  ON procurements.sms_supervision_plan_entries;
DROP POLICY IF EXISTS "sms_supervision_plan_entries: delete"
  ON procurements.sms_supervision_plan_entries;

CREATE POLICY "sms_supervision_plan_entries: select"
  ON procurements.sms_supervision_plan_entries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM procurements.sms_supervision_plans p
    WHERE p.id = plan_id AND procurements.sms_supervision_in_scope(p.school_id)
  ));

CREATE POLICY "sms_supervision_plan_entries: write"
  ON procurements.sms_supervision_plan_entries FOR ALL
  USING (
    procurements.sms_actor_is_supervision_staff()
    AND EXISTS (
      SELECT 1 FROM procurements.sms_supervision_plans p
      WHERE p.id = plan_id AND procurements.sms_supervision_in_scope(p.school_id)
    )
  )
  WITH CHECK (
    procurements.sms_actor_is_supervision_staff()
    AND EXISTS (
      SELECT 1 FROM procurements.sms_supervision_plans p
      WHERE p.id = plan_id AND procurements.sms_supervision_in_scope(p.school_id)
    )
  );

DROP POLICY IF EXISTS "sms_supervision_schedule_observers: select"
  ON procurements.sms_supervision_schedule_observers;
DROP POLICY IF EXISTS "sms_supervision_schedule_observers: insert"
  ON procurements.sms_supervision_schedule_observers;
DROP POLICY IF EXISTS "sms_supervision_schedule_observers: update"
  ON procurements.sms_supervision_schedule_observers;
DROP POLICY IF EXISTS "sms_supervision_schedule_observers: delete"
  ON procurements.sms_supervision_schedule_observers;

CREATE POLICY "sms_supervision_schedule_observers: select"
  ON procurements.sms_supervision_schedule_observers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM procurements.sms_supervision_schedules s
    WHERE s.id = schedule_id AND procurements.sms_supervision_in_scope(s.school_id)
  ));

-- A teacher names preferred observers when suggesting a slot; the School Head
-- confirms or replaces them. Both need write access to their own school's slots.
CREATE POLICY "sms_supervision_schedule_observers: write"
  ON procurements.sms_supervision_schedule_observers FOR ALL
  USING (EXISTS (
    SELECT 1 FROM procurements.sms_supervision_schedules s
    WHERE s.id = schedule_id
      AND procurements.sms_supervision_in_scope(s.school_id)
      AND (procurements.sms_actor_is_supervision_staff()
           OR s.teacher_id = procurements.sms_actor_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM procurements.sms_supervision_schedules s
    WHERE s.id = schedule_id
      AND procurements.sms_supervision_in_scope(s.school_id)
      AND (procurements.sms_actor_is_supervision_staff()
           OR s.teacher_id = procurements.sms_actor_id())
  ));

DROP POLICY IF EXISTS "sms_cot_ratings: select" ON procurements.sms_cot_ratings;
DROP POLICY IF EXISTS "sms_cot_ratings: insert" ON procurements.sms_cot_ratings;
DROP POLICY IF EXISTS "sms_cot_ratings: update" ON procurements.sms_cot_ratings;
DROP POLICY IF EXISTS "sms_cot_ratings: delete" ON procurements.sms_cot_ratings;

CREATE POLICY "sms_cot_ratings: select"
  ON procurements.sms_cot_ratings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM procurements.sms_cot_observations o
    WHERE o.id = observation_id AND procurements.sms_supervision_in_scope(o.school_id)
  ));

-- Ratings inherit their parent form's ownership exactly.
CREATE POLICY "sms_cot_ratings: write"
  ON procurements.sms_cot_ratings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM procurements.sms_cot_observations o
    WHERE o.id = observation_id
      AND procurements.sms_supervision_in_scope(o.school_id)
      AND (procurements.sms_actor_is_supervision_staff()
           OR o.observer_id = procurements.sms_actor_id()
           OR (o.kind = 'agreement' AND EXISTS (
                 SELECT 1 FROM procurements.sms_supervision_schedule_observers so
                 WHERE so.schedule_id = o.schedule_id
                   AND so.user_id = procurements.sms_actor_id())))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM procurements.sms_cot_observations o
    WHERE o.id = observation_id
      AND procurements.sms_supervision_in_scope(o.school_id)
      AND (procurements.sms_actor_is_supervision_staff()
           OR o.observer_id = procurements.sms_actor_id()
           OR (o.kind = 'agreement' AND EXISTS (
                 SELECT 1 FROM procurements.sms_supervision_schedule_observers so
                 WHERE so.schedule_id = o.schedule_id
                   AND so.user_id = procurements.sms_actor_id())))
  ));

-- ----------------------------------------------------------------------------
-- 3. Only supervision staff may approve or reject
--
-- A policy cannot express "you may update this row, but not these four
-- columns", so the decision fields are policed by trigger. Without this a
-- teacher who is legitimately allowed to edit their own proposed slot could set
-- status = 'approved' in the same statement.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_supervision_guard_decision()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF procurements.sms_actor_is_supervision_staff() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.decided_by IS DISTINCT FROM OLD.decided_by
     OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
     OR NEW.decision_notes IS DISTINCT FROM OLD.decision_notes
  THEN
    -- One exception: editing an approved slot must still return it to
    -- `proposed` and clear the decision, which is the workflow's own rule.
    IF NEW.status = 'proposed'
       AND NEW.decided_by IS NULL
       AND NEW.decided_at IS NULL
       AND NEW.decision_notes IS NULL
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'Only the School Head may approve or reject an observation schedule.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sms_supervision_guard_decision
  ON procurements.sms_supervision_schedules;
CREATE TRIGGER sms_supervision_guard_decision
  BEFORE UPDATE ON procurements.sms_supervision_schedules
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_supervision_guard_decision();

-- ----------------------------------------------------------------------------
-- 4. School-scope the storage policies
--
-- 122 matched only the first path segment. The path it builds is
-- `supervision-lesson-plans/<school_id>/<school_year>/<uuid>-<name>`, so a
-- teacher at school A could overwrite or delete school B's lesson plans.
-- Segment 2 is the school; `::text` is required because sms_users.school_id is
-- BIGINT (013) while the path segment is text.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "school_management supervision insert" ON storage.objects;
DROP POLICY IF EXISTS "school_management supervision update" ON storage.objects;
DROP POLICY IF EXISTS "school_management supervision delete" ON storage.objects;

DO $$
DECLARE
  prefix TEXT := 'supervision-lesson-plans';
  roles  TEXT := '''teacher'', ''school_head'', ''assistant_school_head'', ''admin'', ''super admin''';
  guard  TEXT;
  op     TEXT;
  clause TEXT;
BEGIN
  guard := format(
    'bucket_id = ''school-management''
     AND split_part(name, ''/'', 1) = %1$L
     AND EXISTS (
       SELECT 1 FROM procurements.sms_users u
       WHERE u.user_id = auth.uid()
         AND u.type IN (%2$s)
         AND (u.type IN (''super admin'', ''division_admin'')
              OR split_part(name, ''/'', 2) = u.school_id::text)
     )', prefix, roles);

  FOREACH op IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
    -- INSERT takes WITH CHECK; UPDATE and DELETE take USING.
    clause := CASE WHEN op = 'insert' THEN 'WITH CHECK' ELSE 'USING' END;
    EXECUTE format(
      'CREATE POLICY "school_management supervision %1$s" ON storage.objects
         FOR %1$s TO authenticated %2$s (%3$s)',
      op, clause, guard);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. FK delete rules 121 got wrong
-- ----------------------------------------------------------------------------

-- 5a. `observer_id ON DELETE SET NULL` contradicted the CHECK that requires it
--     to be non-null for rating/notes forms: deleting any user who had ever
--     filed a form aborted with 23514 instead of cascading cleanly.
--     `observer_name` is already the snapshot that makes SET NULL safe, so the
--     CHECK is the half that was wrong.
ALTER TABLE procurements.sms_cot_observations
  DROP CONSTRAINT IF EXISTS sms_cot_observations_observer_required;
ALTER TABLE procurements.sms_cot_observations
  ADD CONSTRAINT sms_cot_observations_observer_required
  CHECK (kind = 'agreement' OR observer_id IS NOT NULL OR observer_name IS NOT NULL);

-- 5b. N/A means the indicator is excluded entirely, so it cannot also carry a
--     score. 121 documented this but did not constrain it.
ALTER TABLE procurements.sms_cot_ratings
  DROP CONSTRAINT IF EXISTS sms_cot_ratings_na_unscored;
ALTER TABLE procurements.sms_cot_ratings
  ADD CONSTRAINT sms_cot_ratings_na_unscored
  CHECK (NOT not_applicable OR rating IS NULL);

-- 5c. Audit FKs into sms_users had no ON DELETE rule, so they defaulted to
--     NO ACTION and would 23503 on the first account purge. All are nullable
--     provenance columns; SET NULL is the house rule (001).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'procurements'
      AND c.contype = 'f'
      AND c.confrelid = 'procurements.sms_users'::regclass
      AND c.confdeltype = 'a'  -- NO ACTION
      AND t.relname IN (
        'sms_supervision_observers', 'sms_supervision_plans',
        'sms_supervision_schedules', 'sms_cot_observations')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  ALTER TABLE procurements.sms_supervision_observers
    ADD CONSTRAINT sms_supervision_observers_designated_by_fkey
    FOREIGN KEY (designated_by) REFERENCES procurements.sms_users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE procurements.sms_supervision_plans
    ADD CONSTRAINT sms_supervision_plans_prepared_by_fkey
    FOREIGN KEY (prepared_by) REFERENCES procurements.sms_users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE procurements.sms_supervision_plans
    ADD CONSTRAINT sms_supervision_plans_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES procurements.sms_users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE procurements.sms_supervision_schedules
    ADD CONSTRAINT sms_supervision_schedules_proposed_by_fkey
    FOREIGN KEY (proposed_by) REFERENCES procurements.sms_users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE procurements.sms_supervision_schedules
    ADD CONSTRAINT sms_supervision_schedules_decided_by_fkey
    FOREIGN KEY (decided_by) REFERENCES procurements.sms_users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE procurements.sms_cot_observations
    ADD CONSTRAINT sms_cot_observations_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES procurements.sms_users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5d. `teacher_id ON DELETE CASCADE` silently destroyed signed COT forms:
--     schedule -> cot_observations -> cot_ratings, all gone with the account.
--     121's own header argues for deactivating rather than deleting. RESTRICT
--     makes that argument enforceable — the delete fails loudly instead.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT c.conname INTO cname
  FROM pg_constraint c
  WHERE c.conrelid = 'procurements.sms_supervision_schedules'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'procurements.sms_users'::regclass
    AND c.conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'procurements.sms_supervision_schedules'::regclass
        AND attname = 'teacher_id')]::smallint[]
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE procurements.sms_supervision_schedules DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE procurements.sms_supervision_schedules
    ADD CONSTRAINT sms_supervision_schedules_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES procurements.sms_users(id) ON DELETE RESTRICT;
END $$;

COMMENT ON FUNCTION procurements.sms_supervision_in_scope(BIGINT) IS
  'True when the caller may access supervision rows for the given school. '
  'Division roles see every school; everyone else is pinned to their own.';
