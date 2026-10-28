-- =============================================================================
-- 222 — SBFP Viewer: a read-only login for the feeding programme's partners
-- =============================================================================
--
-- The School-Based Feeding Program is co-run with the City LGU, which funds
-- and audits part of it and keeps asking the division for the programme's
-- figures. Until now the only way to let someone outside DepEd look was a
-- `division_type` login, which reaches every school module, or a
-- `region_account` (214), which sees the division dashboard but nothing of the
-- SBFP. An SBFP Viewer is a login whose ONLY purpose is to view the feeding
-- programme: a division-level account (NULL `school_id`, like 214's) that
-- opens `/sbfp-viewer` (division dashboard) and `/sbfp-viewer/reports` (a
-- school's SBFP forms, deliveries, monitoring logs and feedback), and nothing
-- else — `SbfpViewerGuard` keeps it there.
--
-- 1. `sbfp_viewer` joins `sms_users_type_check`
--    (001 → … → 194 → 214 → this). Label "SBFP Viewer" lives in
--    `lib/constants/userTypes.ts`.
--
-- 2. `sbfp_can_view_all` (210) is re-created verbatim from the live definition
--    with `sbfp_viewer` added beside `division_admin` / `division_type`. That
--    is the one rule the beneficiaries, weighings and feeding records SELECT
--    policies (210/211) read, so the viewer reads every school's learners —
--    names, LRN, readings — exactly as the division office does. **This is a
--    decision the division took knowingly**: the LGU partner sees the master
--    lists, which needs a data-sharing agreement on file. The other SBFP
--    tables were already readable by every `authenticated` user.
--
-- 3. `sbfp_division_overview(sy)` and `sbfp_division_nutrition(sy)` — the
--    dashboard's two reads. SECURITY DEFINER with an explicit guard (super
--    admin / division_admin / division_type / sbfp_viewer), the 193 lesson:
--    under RLS every beneficiary row would call `sbfp_can_view_beneficiary_row`,
--    and the dashboard needs the whole division at once. **Only counts leave
--    these functions**; the learner lists come through the ordinary tables and
--    their policies. Active schools only and the test schools (9, 10) left out,
--    per 206's rule for a division aggregate.
--    Counting rules, matching the printed forms:
--      * attendance = days present (any code but 'A') on a current feeding day,
--        over beneficiaries × feeding days — Form 1B's average, since every
--        beneficiary of a programme shares its feeding days; a code on a
--        removed day is ignored (209);
--      * milk participant = `milk_tolerance` 'none' / 'intolerant_willing'
--        (`isMilkParticipant`);
--      * rehabilitated = baseline severely wasted / wasted AND endline normal,
--        overweight or obese.
--
-- 4. **Read-only in the database, not just in the menu.** `sms_students`,
--    `sms_sections`, `sms_schools` and a long tail of older tables have write
--    policies open to every `authenticated` user (pre-existing), and the anon
--    key ships in the browser bundle — so an outside login could edit learner
--    records from the console (the 161 lesson). Every RLS-enabled table in
--    `procurements` gets three RESTRICTIVE policies (`sbfp_viewer_no_insert`,
--    `_no_update`, `_no_delete`) that refuse the write when the caller is
--    acting as an SBFP Viewer. RESTRICTIVE policies are AND-ed with the
--    existing permissive ones, so **for every other role nothing changes**;
--    nobody can hold `sbfp_viewer` before this is applied.
--    Exceptions, deliberately:
--      * `sms_users` — `AuthGuard` writes the viewer's own `user_id` on first
--        login; its type and school are already guarded by 134/163's triggers.
--      * tables WITHOUT RLS (e.g. `sms_student_subjects`, see 179's warning) are
--        not covered — a policy on them does nothing until RLS is enabled.
--      * SECURITY DEFINER write RPCs run past RLS; each names its own roster
--        of roles, and none names `sbfp_viewer`.
--    The check is `(SELECT procurements.sms_actor_is_sbfp_viewer())`, which
--    Postgres evaluates once per statement, not once per row.
--    ⚠ A table created AFTER this migration has none of the three until a
--    later migration re-runs part 4 (it is idempotent: DROP IF EXISTS first).
--
-- Nobody can hold the role before this is applied, so no existing account
-- changes. One CHECK replaced, one function replaced (same signature, so grants
-- are kept), three new functions, three restrictive policies per RLS table; no
-- DML.
--
-- Pre-apply check (read-only): `sbfp_can_view_all` must match 210's body
-- before this replaces it — stop if production carries a branch this file
-- lacks:
--   SELECT pg_get_functiondef('procurements.sbfp_can_view_all(bigint)'::regprocedure);
--
-- Tests: supabase/tests/222_sbfp_viewer.sql (one transaction, rolled back).
-- =============================================================================

SET search_path TO procurements, public;

-- 1. The role ---------------------------------------------------------------

ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check CHECK (
  type = ANY (ARRAY[
    'school_head', 'assistant_school_head', 'teacher', 'volunteer_teacher',
    'registrar', 'admin', 'super admin', 'division_admin', 'division_type',
    'librarian', 'tutor', 'guidance_counselor', 'school_nurse', 'accounting',
    'security_guard', 'utility_worker', 'qa', 'region_account', 'sbfp_viewer'
  ]::text[])
);

-- The active role (invariant 12). Used by the restrictive policies below.
CREATE OR REPLACE FUNCTION procurements.sms_actor_is_sbfp_viewer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT COALESCE(
    (SELECT type = 'sbfp_viewer'
       FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1),
    FALSE);
$$;

REVOKE ALL ON FUNCTION procurements.sms_actor_is_sbfp_viewer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sms_actor_is_sbfp_viewer() TO authenticated;

-- 2. Learner-level SBFP rows ------------------------------------------------
-- 210's body verbatim; the only change is `'sbfp_viewer'` in the division list.

CREATE OR REPLACE FUNCTION procurements.sbfp_can_view_all(p_program_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id)
      OR EXISTS (
        SELECT 1
          FROM procurements.sms_sbfp_programs p
          JOIN procurements.sms_users u ON u.user_id = auth.uid()
         WHERE p.id = p_program_id
           AND u.is_active
           AND (
             u.type IN ('division_admin', 'division_type', 'sbfp_viewer')
             OR (u.type IN ('registrar', 'librarian') AND u.school_id = p.school_id)
           )
      );
$$;

-- 3. Dashboard reads --------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.sbfp_assert_division_reader()
RETURNS VOID
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM procurements.sms_users u
     WHERE u.user_id = auth.uid()
       AND u.is_active
       AND u.type IN ('super admin', 'division_admin', 'division_type', 'sbfp_viewer')
  ) THEN
    RAISE EXCEPTION 'Only the division office and SBFP viewers may read the division feeding programme.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_assert_division_reader() FROM PUBLIC, anon, authenticated;

-- One row per active school (a school with no programme yet still appears,
-- with `program_id` NULL, so "who has not started" is answerable).
CREATE OR REPLACE FUNCTION procurements.sbfp_division_overview(p_school_year TEXT)
RETURNS TABLE (
  school_id            BIGINT,
  school_name          TEXT,
  district             TEXT,
  program_id           BIGINT,
  is_last_mile_school  BOOLEAN,
  feeding_start_date   DATE,
  feeding_end_date     DATE,
  beneficiaries        BIGINT,
  male                 BIGINT,
  female               BIGINT,
  primary_count        BIGINT,
  secondary_count      BIGINT,
  milk_participants    BIGINT,
  baseline_weighed     BIGINT,
  midline_weighed      BIGINT,
  endline_weighed      BIGINT,
  wasted_at_baseline   BIGINT,
  rehabilitated        BIGINT,
  feeding_days         BIGINT,
  days_present         BIGINT,
  deliveries           BIGINT,
  packs_new            BIGINT,
  packs_replacement    BIGINT,
  packs_rejected       BIGINT,
  hot_meal_deliveries  BIGINT,
  servings_new         BIGINT,
  servings_replacement BIGINT,
  servings_rejected    BIGINT,
  feedback_open        BIGINT,
  feedback_in_progress BIGINT,
  feedback_resolved    BIGINT,
  kitchen_logs         BIGINT,
  dispatch_logs        BIGINT,
  receiving_logs       BIGINT,
  quality_evaluations  BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  PERFORM procurements.sbfp_assert_division_reader();

  RETURN QUERY
  WITH sch AS (
    SELECT s.id, s.name::TEXT AS name, s.district::TEXT AS district
      FROM sms_schools s
     WHERE s.is_active
       AND s.id NOT IN (9, 10)
  ),
  prog AS (
    SELECT p.* FROM sms_sbfp_programs p
     WHERE p.school_year = p_school_year
  ),
  ben AS (
    SELECT b.id, b.program_id, b.classification, b.milk_tolerance,
           lower(trim(COALESCE(st.gender, ''))) AS g
      FROM sms_sbfp_beneficiaries b
      JOIN prog ON prog.id = b.program_id
      LEFT JOIN sms_students st ON st.id = b.student_id
  ),
  meas AS (
    SELECT m.beneficiary_id,
           bool_or(m.period = 'baseline') AS has_base,
           bool_or(m.period = 'midline')  AS has_mid,
           bool_or(m.period = 'endline')  AS has_end,
           bool_or(m.period = 'baseline' AND m.nutritional_status IN ('severely_wasted', 'wasted')) AS base_wasted,
           bool_or(m.period = 'endline'  AND m.nutritional_status IN ('normal', 'overweight', 'obese')) AS end_ok
      FROM sms_sbfp_measurements m
      JOIN ben ON ben.id = m.beneficiary_id
     GROUP BY m.beneficiary_id
  ),
  ben_agg AS (
    SELECT ben.program_id,
           count(*)                                                        AS n,
           count(*) FILTER (WHERE ben.g IN ('male', 'm'))                  AS male,
           count(*) FILTER (WHERE ben.g IN ('female', 'f'))                AS female,
           count(*) FILTER (WHERE ben.classification = 'primary')          AS prim,
           count(*) FILTER (WHERE ben.classification = 'secondary')        AS sec,
           count(*) FILTER (WHERE ben.milk_tolerance IN ('none', 'intolerant_willing')) AS milk,
           count(*) FILTER (WHERE meas.has_base)                           AS base,
           count(*) FILTER (WHERE meas.has_mid)                            AS mid,
           count(*) FILTER (WHERE meas.has_end)                            AS endl,
           count(*) FILTER (WHERE meas.base_wasted)                        AS wasted,
           count(*) FILTER (WHERE meas.base_wasted AND meas.end_ok)        AS rehab
      FROM ben
      LEFT JOIN meas ON meas.beneficiary_id = ben.id
     GROUP BY ben.program_id
  ),
  days AS (
    SELECT d.program_id, count(*) AS n
      FROM sms_sbfp_feeding_days d JOIN prog ON prog.id = d.program_id
     GROUP BY d.program_id
  ),
  present AS (
    SELECT ben.program_id, count(*) AS n
      FROM sms_sbfp_feeding_records r
      JOIN ben ON ben.id = r.beneficiary_id
      JOIN sms_sbfp_feeding_days d
        ON d.program_id = ben.program_id AND d.feeding_date = r.feeding_date
     WHERE r.code IS NOT NULL AND r.code <> 'A'
     GROUP BY ben.program_id
  ),
  deliv AS (
    SELECT dl.program_id,
           count(*)                                              AS n,
           COALESCE(sum(dl.packs_new), 0)                        AS pn,
           COALESCE(sum(dl.packs_replacement), 0)                AS pr,
           COALESCE(sum(dl.packs_rejected), 0)                   AS pj,
           count(*) FILTER (WHERE dl.component = 'hot_meals')    AS hot
      FROM sms_sbfp_deliveries dl JOIN prog ON prog.id = dl.program_id
     GROUP BY dl.program_id
  ),
  meals AS (
    SELECT dl.program_id,
           COALESCE(sum(ml.servings) FILTER (WHERE ml.kind = 'new'), 0)         AS sn,
           COALESCE(sum(ml.servings) FILTER (WHERE ml.kind = 'replacement'), 0) AS sr,
           COALESCE(sum(ml.servings) FILTER (WHERE ml.kind = 'rejected'), 0)    AS sj
      FROM sms_sbfp_delivery_meals ml
      JOIN sms_sbfp_deliveries dl ON dl.id = ml.delivery_id
      JOIN prog ON prog.id = dl.program_id
     GROUP BY dl.program_id
  ),
  fb AS (
    SELECT f.program_id,
           count(*) FILTER (WHERE f.status = 'open')        AS o,
           count(*) FILTER (WHERE f.status = 'in_progress') AS ip,
           count(*) FILTER (WHERE f.status = 'resolved')    AS r
      FROM sms_sbfp_feedback f JOIN prog ON prog.id = f.program_id
     GROUP BY f.program_id
  ),
  kl AS (SELECT x.program_id, count(*) AS n FROM sms_sbfp_kitchen_logs x   JOIN prog ON prog.id = x.program_id GROUP BY x.program_id),
  dsl AS (SELECT x.program_id, count(*) AS n FROM sms_sbfp_dispatch_logs x  JOIN prog ON prog.id = x.program_id GROUP BY x.program_id),
  rl AS (SELECT x.program_id, count(*) AS n FROM sms_sbfp_receiving_logs x JOIN prog ON prog.id = x.program_id GROUP BY x.program_id),
  ql AS (SELECT x.program_id, count(*) AS n FROM sms_sbfp_quality_responses x JOIN prog ON prog.id = x.program_id GROUP BY x.program_id)
  SELECT sch.id,
         sch.name,
         sch.district,
         prog.id,
         prog.is_last_mile_school,
         prog.feeding_start_date,
         prog.feeding_end_date,
         COALESCE(ben_agg.n, 0)::BIGINT,
         COALESCE(ben_agg.male, 0)::BIGINT,
         COALESCE(ben_agg.female, 0)::BIGINT,
         COALESCE(ben_agg.prim, 0)::BIGINT,
         COALESCE(ben_agg.sec, 0)::BIGINT,
         COALESCE(ben_agg.milk, 0)::BIGINT,
         COALESCE(ben_agg.base, 0)::BIGINT,
         COALESCE(ben_agg.mid, 0)::BIGINT,
         COALESCE(ben_agg.endl, 0)::BIGINT,
         COALESCE(ben_agg.wasted, 0)::BIGINT,
         COALESCE(ben_agg.rehab, 0)::BIGINT,
         COALESCE(days.n, 0)::BIGINT,
         COALESCE(present.n, 0)::BIGINT,
         COALESCE(deliv.n, 0)::BIGINT,
         COALESCE(deliv.pn, 0)::BIGINT,
         COALESCE(deliv.pr, 0)::BIGINT,
         COALESCE(deliv.pj, 0)::BIGINT,
         COALESCE(deliv.hot, 0)::BIGINT,
         COALESCE(meals.sn, 0)::BIGINT,
         COALESCE(meals.sr, 0)::BIGINT,
         COALESCE(meals.sj, 0)::BIGINT,
         COALESCE(fb.o, 0)::BIGINT,
         COALESCE(fb.ip, 0)::BIGINT,
         COALESCE(fb.r, 0)::BIGINT,
         COALESCE(kl.n, 0)::BIGINT,
         COALESCE(dsl.n, 0)::BIGINT,
         COALESCE(rl.n, 0)::BIGINT,
         COALESCE(ql.n, 0)::BIGINT
    FROM sch
    LEFT JOIN prog    ON prog.school_id = sch.id
    LEFT JOIN ben_agg ON ben_agg.program_id = prog.id
    LEFT JOIN days    ON days.program_id = prog.id
    LEFT JOIN present ON present.program_id = prog.id
    LEFT JOIN deliv   ON deliv.program_id = prog.id
    LEFT JOIN meals   ON meals.program_id = prog.id
    LEFT JOIN fb      ON fb.program_id = prog.id
    LEFT JOIN kl      ON kl.program_id = prog.id
    LEFT JOIN dsl     ON dsl.program_id = prog.id
    LEFT JOIN rl      ON rl.program_id = prog.id
    LEFT JOIN ql      ON ql.program_id = prog.id
   ORDER BY sch.name;
END;
$$;

-- Weighings by school, period, grade level and sex — one row per combination
-- that has learners, so the client sums any level (division, district, school,
-- grade) and every level agrees with the one beneath it (193's shape).
CREATE OR REPLACE FUNCTION procurements.sbfp_division_nutrition(p_school_year TEXT)
RETURNS TABLE (
  school_id          BIGINT,
  period             TEXT,
  grade_level        INTEGER,
  sex                TEXT,
  nutritional_status TEXT,
  height_for_age     TEXT,
  learners           BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  PERFORM procurements.sbfp_assert_division_reader();

  RETURN QUERY
  SELECT p.school_id,
         m.period::TEXT,
         sec.grade_level::INTEGER,
         CASE lower(trim(COALESCE(st.gender, '')))
           WHEN 'male' THEN 'male' WHEN 'm' THEN 'male'
           WHEN 'female' THEN 'female' WHEN 'f' THEN 'female'
           ELSE 'unspecified'
         END,
         m.nutritional_status::TEXT,
         m.height_for_age::TEXT,
         count(*)::BIGINT
    FROM sms_sbfp_measurements m
    JOIN sms_sbfp_beneficiaries b ON b.id = m.beneficiary_id
    JOIN sms_sbfp_programs p      ON p.id = b.program_id
    JOIN sms_schools s            ON s.id = p.school_id
    LEFT JOIN sms_sections sec    ON sec.id = b.section_id
    LEFT JOIN sms_students st     ON st.id = b.student_id
   WHERE p.school_year = p_school_year
     AND s.is_active
     AND s.id NOT IN (9, 10)
   GROUP BY 1, 2, 3, 4, 5, 6;
END;
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_division_overview(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_division_nutrition(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_division_overview(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_division_nutrition(TEXT) TO authenticated;

-- 4. Read-only in the database ----------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'procurements'
       AND c.relkind IN ('r', 'p')
       AND c.relrowsecurity
       AND c.relname <> 'sms_users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS sbfp_viewer_no_insert ON procurements.%I', t);
    EXECUTE format(
      'CREATE POLICY sbfp_viewer_no_insert ON procurements.%I AS RESTRICTIVE FOR INSERT TO authenticated '
      'WITH CHECK (NOT (SELECT procurements.sms_actor_is_sbfp_viewer()))', t);
    EXECUTE format('DROP POLICY IF EXISTS sbfp_viewer_no_update ON procurements.%I', t);
    EXECUTE format(
      'CREATE POLICY sbfp_viewer_no_update ON procurements.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      'USING (NOT (SELECT procurements.sms_actor_is_sbfp_viewer()))', t);
    EXECUTE format('DROP POLICY IF EXISTS sbfp_viewer_no_delete ON procurements.%I', t);
    EXECUTE format(
      'CREATE POLICY sbfp_viewer_no_delete ON procurements.%I AS RESTRICTIVE FOR DELETE TO authenticated '
      'USING (NOT (SELECT procurements.sms_actor_is_sbfp_viewer()))', t);
  END LOOP;
END $$;

-- Verification (read-only): every RLS table but sms_users carries the three.
--   SELECT count(DISTINCT tablename) AS tables, count(*) AS policies
--     FROM pg_policies
--    WHERE schemaname = 'procurements' AND policyname LIKE 'sbfp_viewer_no_%';
