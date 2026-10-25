-- ============================================================================
-- 220: SBFP Hot Meals deliveries + daily Monitoring tools
-- ============================================================================
-- Two things the division asked to add to the feeding programme (209):
--
-- (a) HOT MEALS on the Deliveries tab. 209's deliveries counted packs of NFP
--     or milk. A hot meal is not a pack: the kitchen sends a viand, in some
--     unit (trays, kilos, pots), that yields a number of servings — and what
--     came new, what came as a replacement and what was sent back can each be
--     a different viand. So a hot-meals delivery carries its lines in a child
--     table, one per (kind, viand):
--
--       sms_sbfp_delivery_meals  kind new / replacement / rejected, quantity,
--                                unit, viand name, servings yielded.
--
--     `component` gains 'hot_meals'. A hot meal is cooked for the school, not
--     per grade level, so grade_level becomes optional for that component
--     only — NFP and milk still require it (Form 6 tabulates by grade). The
--     packs_* columns stay 0 on a hot-meals row; Form 6 never reads one.
--
-- (b) A MONITORING tab: the four daily tools the division issued.
--
--       sms_sbfp_kitchens          the centralized kitchens (a kitchen is a
--                                  school). Division-wide, seeded with the
--                                  four the division named; "At school site"
--                                  is a NULL kitchen on the log, not a row.
--       sms_sbfp_kitchen_logs      Daily Monitoring Tool for Kitchens: target
--                                  and actual schools prepared for, excess /
--                                  rejected food, hygiene and vehicle
--                                  checklists.
--       sms_sbfp_dispatch_logs     Food Dispatch Daily Monitoring Tool:
--                                  schools dispatched to, vehicle type,
--                                  departure time and weather.
--       sms_sbfp_receiving_logs    School Recipient Daily Receiving and
--                                  Feeding Monitoring Tool: arrival, food
--                                  condition, quantity verification, safety
--                                  compliance, beneficiary monitoring,
--                                  incident report.
--       sms_sbfp_quality_questions Daily Hot Meals Quality Evaluation Tool —
--                                  the questions, kept in a table so the
--                                  division can change them ("dynamic"):
--                                  kind face (smiley scale) or text.
--       sms_sbfp_quality_responses one learner's answers, JSONB keyed by
--                                  question id.
--
-- Schools on a log are BIGINT[] of sms_schools.id, not a join table: the list
-- is a snapshot of what was ticked that day, read back whole and never queried
-- by school. Checklist answers are JSONB keyed by the item codes in
-- lib/constants/sbfp.ts (the 119/132 precedent), so a revised checklist never
-- invalidates a filed log; vehicle type and weather are free TEXT for the same
-- reason.
--
-- A question is RETIRED (is_active = false), never deleted, so every response
-- already filed still prints against its question (the 195 rule).
--
-- Who writes: every log is filed by anyone who may encode in the programme —
-- a manager (209) or a teacher of the school (210) — exactly 212's rule, so
-- 212's two helpers are reused rather than copied: sbfp_can_log_feedback
-- decides who may file, sbfp_can_edit_feedback who may change an entry (a
-- manager, or its author). Hot-meal lines follow their delivery, which is
-- managers only (209's sbfp_deliveries_write). Kitchens and questions are
-- division-wide and written by the active super admin / division_admin.
-- SELECT is open to authenticated, as every SBFP table is (209).
--
-- Touches one existing object: sms_sbfp_deliveries gets its component CHECK
-- widened, grade_level made nullable and a CHECK that only hot meals may omit
-- it. No existing row can violate either (every row is nfp/milk with a grade).
-- No policy, trigger or function replaced. Only DML: the kitchen and question
-- seeds, both ON CONFLICT DO NOTHING.
-- ============================================================================

SET search_path TO procurements, public;

-- ---------------------------------------------------------------------------
-- 1. Hot meals on deliveries
-- ---------------------------------------------------------------------------
-- 209 declared the CHECK inline, so its name is generated; find it by its
-- definition rather than guess (the 116 lesson).
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'procurements.sms_sbfp_deliveries'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%component%'
       AND c.conname <> 'sms_sbfp_deliveries_component_check_220'
  LOOP
    EXECUTE format('ALTER TABLE procurements.sms_sbfp_deliveries DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE procurements.sms_sbfp_deliveries
  DROP CONSTRAINT IF EXISTS sms_sbfp_deliveries_component_check_220;
ALTER TABLE procurements.sms_sbfp_deliveries
  ADD CONSTRAINT sms_sbfp_deliveries_component_check_220
  CHECK (component IN ('nfp', 'milk', 'hot_meals'));

ALTER TABLE procurements.sms_sbfp_deliveries
  ALTER COLUMN grade_level DROP NOT NULL;
ALTER TABLE procurements.sms_sbfp_deliveries
  DROP CONSTRAINT IF EXISTS sms_sbfp_deliveries_grade_required;
ALTER TABLE procurements.sms_sbfp_deliveries
  ADD CONSTRAINT sms_sbfp_deliveries_grade_required
  CHECK (component = 'hot_meals' OR grade_level IS NOT NULL);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_delivery_meals (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_deliveries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('new', 'replacement', 'rejected')),
  sort_order INT NOT NULL DEFAULT 0,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit TEXT,
  viand_name TEXT NOT NULL CHECK (btrim(viand_name) <> ''),
  servings INT NOT NULL DEFAULT 0 CHECK (servings >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_sbfp_delivery_meals_delivery
  ON procurements.sms_sbfp_delivery_meals(delivery_id);

DROP TRIGGER IF EXISTS update_sms_sbfp_delivery_meals_updated_at ON procurements.sms_sbfp_delivery_meals;
CREATE TRIGGER update_sms_sbfp_delivery_meals_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_delivery_meals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A line belongs to a hot-meals delivery, and never moves to another one.
CREATE OR REPLACE FUNCTION procurements.sbfp_guard_delivery_meal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.delivery_id IS DISTINCT FROM OLD.delivery_id THEN
    RAISE EXCEPTION 'A hot-meal line cannot be moved to another delivery.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM procurements.sms_sbfp_deliveries d
     WHERE d.id = NEW.delivery_id AND d.component = 'hot_meals'
  ) THEN
    RAISE EXCEPTION 'Viand lines belong only to a Hot Meals delivery.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sbfp_guard_delivery_meal ON procurements.sms_sbfp_delivery_meals;
CREATE TRIGGER sbfp_guard_delivery_meal
  BEFORE INSERT OR UPDATE ON procurements.sms_sbfp_delivery_meals
  FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_guard_delivery_meal();

-- A delivery carrying viand lines stays a hot-meals delivery.
CREATE OR REPLACE FUNCTION procurements.sbfp_guard_delivery_component()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF OLD.component = 'hot_meals' AND NEW.component <> 'hot_meals'
     AND EXISTS (SELECT 1 FROM procurements.sms_sbfp_delivery_meals m WHERE m.delivery_id = OLD.id)
  THEN
    RAISE EXCEPTION 'Remove the viand lines before changing this delivery''s component.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sbfp_guard_delivery_component ON procurements.sms_sbfp_deliveries;
CREATE TRIGGER sbfp_guard_delivery_component
  BEFORE UPDATE OF component ON procurements.sms_sbfp_deliveries
  FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_guard_delivery_component();

-- ---------------------------------------------------------------------------
-- 2. Kitchens and evaluation questions (division-wide)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sbfp_is_division_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_users u
     WHERE u.user_id = auth.uid()
       AND u.is_active
       AND u.type IN ('super admin', 'division_admin')
  );
$$;

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_kitchens (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL UNIQUE REFERENCES procurements.sms_schools(id) ON DELETE RESTRICT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_sms_sbfp_kitchens_updated_at ON procurements.sms_sbfp_kitchens;
CREATE TRIGGER update_sms_sbfp_kitchens_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_kitchens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_quality_questions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('face', 'text')),
  prompt TEXT NOT NULL CHECK (btrim(prompt) <> ''),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_sms_sbfp_quality_questions_updated_at ON procurements.sms_sbfp_quality_questions;
CREATE TRIGGER update_sms_sbfp_quality_questions_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_quality_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- An answered question keeps its kind: a smiley answer read as text, or the
-- reverse, would misprint every response already filed.
CREATE OR REPLACE FUNCTION procurements.sbfp_guard_quality_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind
     AND EXISTS (
       SELECT 1 FROM procurements.sms_sbfp_quality_responses r
        WHERE r.answers ? OLD.id::TEXT
     )
  THEN
    RAISE EXCEPTION 'This question already has answers; retire it and add a new one instead of changing its kind.';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Daily logs (one programme = one school's SY, per 209)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_kitchen_logs (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_programs(id) ON DELETE CASCADE,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL = "At school site" (the school cooks for itself).
  kitchen_id BIGINT REFERENCES procurements.sms_sbfp_kitchens(id) ON DELETE RESTRICT,
  target_school_ids BIGINT[] NOT NULL DEFAULT '{}',
  actual_school_ids BIGINT[] NOT NULL DEFAULT '{}',
  has_excess_food BOOLEAN,
  has_rejected_food BOOLEAN,
  rejected_reason TEXT,
  hygiene_checklist JSONB NOT NULL DEFAULT '{}'::JSONB,
  vehicle_checklist JSONB NOT NULL DEFAULT '{}'::JSONB,
  delivery_personnel_name TEXT,
  remarks TEXT,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_sbfp_kitchen_logs_checklists_objects
    CHECK (jsonb_typeof(hygiene_checklist) = 'object' AND jsonb_typeof(vehicle_checklist) = 'object')
);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_dispatch_logs (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_programs(id) ON DELETE CASCADE,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kitchen_id BIGINT REFERENCES procurements.sms_sbfp_kitchens(id) ON DELETE RESTRICT,
  school_ids BIGINT[] NOT NULL DEFAULT '{}',
  vehicle_type TEXT,
  vehicle_other TEXT,
  departed_at TIME,
  weather TEXT,
  remarks TEXT,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_receiving_logs (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_programs(id) ON DELETE CASCADE,
  received_on DATE NOT NULL DEFAULT CURRENT_DATE,
  arrived_at TIME,
  weather TEXT,
  delivery_remarks TEXT,
  food_condition JSONB NOT NULL DEFAULT '{}'::JSONB,
  condition_remarks TEXT,
  sets_expected INT CHECK (sets_expected >= 0),
  sets_received INT CHECK (sets_received >= 0),
  sets_damaged INT NOT NULL DEFAULT 0 CHECK (sets_damaged >= 0),
  sets_rejected INT NOT NULL DEFAULT 0 CHECK (sets_rejected >= 0),
  sets_additional INT NOT NULL DEFAULT 0 CHECK (sets_additional >= 0),
  safety_checklist JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Snapshot of the beneficiary list on the day, so a later change to the
  -- list does not rewrite a filed log (the 112/121 rule).
  total_beneficiaries INT CHECK (total_beneficiaries >= 0),
  present_beneficiaries INT CHECK (present_beneficiaries >= 0),
  absent_beneficiaries INT NOT NULL DEFAULT 0 CHECK (absent_beneficiaries >= 0),
  meals_consumed INT CHECK (meals_consumed >= 0),
  leftover_meals INT NOT NULL DEFAULT 0 CHECK (leftover_meals >= 0),
  additional_serving_requests INT NOT NULL DEFAULT 0 CHECK (additional_serving_requests >= 0),
  has_incident BOOLEAN,
  incident_details TEXT,
  remarks TEXT,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_sbfp_receiving_logs_json_objects
    CHECK (jsonb_typeof(food_condition) = 'object' AND jsonb_typeof(safety_checklist) = 'object')
);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_quality_responses (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_programs(id) ON DELETE CASCADE,
  evaluated_on DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Optional: an evaluation may be anonymous.
  beneficiary_id BIGINT REFERENCES procurements.sms_sbfp_beneficiaries(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(answers) = 'object'),
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS sbfp_guard_quality_question ON procurements.sms_sbfp_quality_questions;
CREATE TRIGGER sbfp_guard_quality_question
  BEFORE UPDATE OF kind ON procurements.sms_sbfp_quality_questions
  FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_guard_quality_question();

CREATE INDEX IF NOT EXISTS idx_sms_sbfp_kitchen_logs_program
  ON procurements.sms_sbfp_kitchen_logs(program_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_sms_sbfp_dispatch_logs_program
  ON procurements.sms_sbfp_dispatch_logs(program_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_sms_sbfp_receiving_logs_program
  ON procurements.sms_sbfp_receiving_logs(program_id, received_on);
CREATE INDEX IF NOT EXISTS idx_sms_sbfp_quality_responses_program
  ON procurements.sms_sbfp_quality_responses(program_id, evaluated_on);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_sbfp_kitchen_logs', 'sms_sbfp_dispatch_logs',
    'sms_sbfp_receiving_logs', 'sms_sbfp_quality_responses'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%1$s_updated_at ON procurements.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER update_%1$s_updated_at BEFORE UPDATE ON procurements.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    -- 212's stamp: the author is whoever inserts, the entry never changes
    -- programme. Its function reads only program_id and created_by.
    EXECUTE format('DROP TRIGGER IF EXISTS sbfp_stamp_author ON procurements.%I', t);
    EXECUTE format(
      'CREATE TRIGGER sbfp_stamp_author BEFORE INSERT OR UPDATE ON procurements.%I
         FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_stamp_feedback()', t);
  END LOOP;
END $$;

-- An evaluation's learner must be a beneficiary of the same programme.
CREATE OR REPLACE FUNCTION procurements.sbfp_guard_quality_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF NEW.beneficiary_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM procurements.sms_sbfp_beneficiaries b
     WHERE b.id = NEW.beneficiary_id AND b.program_id = NEW.program_id
  ) THEN
    RAISE EXCEPTION 'That learner is not a beneficiary of this programme.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sbfp_guard_quality_response ON procurements.sms_sbfp_quality_responses;
CREATE TRIGGER sbfp_guard_quality_response
  BEFORE INSERT OR UPDATE OF beneficiary_id, program_id ON procurements.sms_sbfp_quality_responses
  FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_guard_quality_response();

REVOKE ALL ON FUNCTION procurements.sbfp_guard_delivery_meal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_guard_delivery_component() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_guard_quality_question() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_guard_quality_response() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_is_division_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_is_division_manager() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE procurements.sms_sbfp_delivery_meals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sbfp_delivery_meals_select" ON procurements.sms_sbfp_delivery_meals;
CREATE POLICY "sbfp_delivery_meals_select" ON procurements.sms_sbfp_delivery_meals
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_delivery_meals_write" ON procurements.sms_sbfp_delivery_meals;
CREATE POLICY "sbfp_delivery_meals_write" ON procurements.sms_sbfp_delivery_meals
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM procurements.sms_sbfp_deliveries d
     WHERE d.id = delivery_id AND procurements.sbfp_can_manage(d.program_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM procurements.sms_sbfp_deliveries d
     WHERE d.id = delivery_id AND procurements.sbfp_can_manage(d.program_id)));

ALTER TABLE procurements.sms_sbfp_kitchens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sbfp_kitchens_select" ON procurements.sms_sbfp_kitchens;
CREATE POLICY "sbfp_kitchens_select" ON procurements.sms_sbfp_kitchens
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_kitchens_write" ON procurements.sms_sbfp_kitchens;
CREATE POLICY "sbfp_kitchens_write" ON procurements.sms_sbfp_kitchens
  FOR ALL TO authenticated
  USING (procurements.sbfp_is_division_manager())
  WITH CHECK (procurements.sbfp_is_division_manager());

ALTER TABLE procurements.sms_sbfp_quality_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sbfp_quality_questions_select" ON procurements.sms_sbfp_quality_questions;
CREATE POLICY "sbfp_quality_questions_select" ON procurements.sms_sbfp_quality_questions
  FOR SELECT TO authenticated USING (true);
-- No DELETE policy: a question is retired, never deleted.
DROP POLICY IF EXISTS "sbfp_quality_questions_insert" ON procurements.sms_sbfp_quality_questions;
CREATE POLICY "sbfp_quality_questions_insert" ON procurements.sms_sbfp_quality_questions
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_is_division_manager());
DROP POLICY IF EXISTS "sbfp_quality_questions_update" ON procurements.sms_sbfp_quality_questions;
CREATE POLICY "sbfp_quality_questions_update" ON procurements.sms_sbfp_quality_questions
  FOR UPDATE TO authenticated
  USING (procurements.sbfp_is_division_manager())
  WITH CHECK (procurements.sbfp_is_division_manager());

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_sbfp_kitchen_logs', 'sms_sbfp_dispatch_logs',
    'sms_sbfp_receiving_logs', 'sms_sbfp_quality_responses'
  ] LOOP
    EXECUTE format('ALTER TABLE procurements.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON procurements.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON procurements.%I FOR SELECT TO authenticated USING (true)',
      t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON procurements.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON procurements.%I FOR INSERT TO authenticated
         WITH CHECK (procurements.sbfp_can_log_feedback(program_id))',
      t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON procurements.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON procurements.%I FOR UPDATE TO authenticated
         USING (procurements.sbfp_can_edit_feedback(program_id, created_by))
         WITH CHECK (procurements.sbfp_can_edit_feedback(program_id, created_by))',
      t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON procurements.%I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON procurements.%I FOR DELETE TO authenticated
         USING (procurements.sbfp_can_edit_feedback(program_id, created_by))',
      t || '_delete', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%I TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%I TO authenticated', t || '_id_seq');
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  procurements.sms_sbfp_delivery_meals,
  procurements.sms_sbfp_kitchens
TO authenticated;
GRANT SELECT, INSERT, UPDATE ON procurements.sms_sbfp_quality_questions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE
  procurements.sms_sbfp_delivery_meals_id_seq,
  procurements.sms_sbfp_kitchens_id_seq,
  procurements.sms_sbfp_quality_questions_id_seq
TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Seeds
-- ---------------------------------------------------------------------------
-- The four centralized kitchens the division named. Matched by name; a school
-- not found is simply not seeded (the verification below shows how many were)
-- and can be added from the Monitoring tab.
INSERT INTO procurements.sms_sbfp_kitchens (school_id, sort_order)
SELECT s.id, k.ord
  FROM (VALUES
    (1, 'bayugan central elementary school sped center'),
    (2, 'noli central elementary school'),
    (3, 'fili national high school'),
    (4, 'salvacion central elementary school')
  ) AS k(ord, name)
  JOIN procurements.sms_schools s
    ON btrim(regexp_replace(lower(s.name), '[^a-z]+', ' ', 'g')) = k.name
ON CONFLICT (school_id) DO NOTHING;

-- Daily Hot Meals Quality Evaluation Tool, as issued.
INSERT INTO procurements.sms_sbfp_quality_questions (code, kind, prompt, sort_order) VALUES
  ('taste',    'face', 'Nalamian ko sa pagkaon karon.', 1),
  ('quantity', 'face', 'Sakto ang kadaghan sa pagkaon.', 2),
  ('fresh',    'face', 'Init ug presko ang pagkaon pag-abot.', 3),
  ('again',    'face', 'Ganahan ko nga mahatagan ani nga pagkaon usab.', 4),
  ('liked',    'text', 'Unsa ang pinakaganahan nimo karong adlawa?', 5),
  ('improve',  'text', 'Unsay angay pa nga improbahon?', 6)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE procurements.sms_sbfp_delivery_meals IS
  'SBFP Hot Meals delivery lines (migration 220): new / replacement / rejected viands with quantity, unit and servings.';
COMMENT ON TABLE procurements.sms_sbfp_kitchens IS
  'SBFP centralized kitchens (migration 220). A NULL kitchen on a log means at school site.';
COMMENT ON TABLE procurements.sms_sbfp_kitchen_logs IS
  'SBFP Daily Monitoring Tool for Kitchens (migration 220).';
COMMENT ON TABLE procurements.sms_sbfp_dispatch_logs IS
  'SBFP Food Dispatch Daily Monitoring Tool (migration 220).';
COMMENT ON TABLE procurements.sms_sbfp_receiving_logs IS
  'SBFP School Recipient Daily Receiving and Feeding Monitoring Tool (migration 220).';
COMMENT ON TABLE procurements.sms_sbfp_quality_questions IS
  'SBFP Daily Hot Meals Quality Evaluation questions (migration 220). Retire, never delete.';
COMMENT ON TABLE procurements.sms_sbfp_quality_responses IS
  'SBFP Daily Hot Meals Quality Evaluation answers (migration 220), JSONB keyed by question id.';

-- Verification: the Supabase SQL editor shows only this last result.
SELECT 'kitchens seeded' AS item, count(*)::TEXT AS value FROM procurements.sms_sbfp_kitchens
UNION ALL
SELECT 'quality questions', count(*)::TEXT FROM procurements.sms_sbfp_quality_questions
UNION ALL
SELECT c.relname || ' rls', c.relrowsecurity::TEXT
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'procurements'
   AND c.relname IN ('sms_sbfp_delivery_meals', 'sms_sbfp_kitchens', 'sms_sbfp_kitchen_logs',
                     'sms_sbfp_dispatch_logs', 'sms_sbfp_receiving_logs',
                     'sms_sbfp_quality_questions', 'sms_sbfp_quality_responses');
