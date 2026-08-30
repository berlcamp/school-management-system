-- ============================================================================
-- 166. Division Report Generator — the engine
-- ============================================================================
--
-- WHY
-- ---
-- /division/reports holds sixteen fixed reports, each one the shape of a DepEd
-- form: its grouping, its subtotals, its signatories, its submission
-- semantics. They answer the questions somebody wrote a page for. They cannot
-- answer "give me every Grade 5 4Ps learner in the district with their
-- guardian's contact number", which is the shape of most of what the SDO is
-- actually asked for, and which today ends as a request to a developer.
--
-- This is the escape hatch: the user picks a dataset, the columns, and the
-- filters, and gets a table they can export or print. It sits BESIDE the
-- fixed reports and replaces none of them — a form's shape is not a column
-- subset, and a builder that tried to reproduce SF4 would produce a figure
-- that disagrees with SF4 (the 165 lesson).
--
-- WHY THE WHITELIST IS IN THE DATABASE
-- ------------------------------------
-- The anon key ships in the browser bundle, so a gate that only hides a picker
-- is lifted with F12 — the 161 lesson. Everything the client sends is treated
-- as untrusted:
--
--   * a column name must match a seeded `sms_report_dataset_fields` row and is
--     rendered through %I; an unrecognised one is DROPPED
--   * a filter must match a seeded row AND an operator legal for that field's
--     type; an unrecognised one RAISES
--   * values are quote_literal-escaped, and ILIKE patterns are additionally
--     escaped for % and _
--
-- The asymmetry between the two is deliberate. Dropping an unknown *column*
-- loses a column. Dropping an unknown *filter* silently WIDENS the result —
-- the user believes they asked for one school and gets the division. So a bad
-- filter is an error, never a shrug.
--
-- There is no `sql_expression` column anywhere here: a field key IS a column
-- name in a view. Any expression a report needs lives in the view, written by
-- a migration and reviewed once. Nothing the client sends is ever interpolated
-- as anything but a quoted identifier that already matched the whitelist.
--
-- WHY THE VIEWS ARE NOT IN `procurements`
-- ---------------------------------------
-- config.toml exposes ["public", "graphql_public", "procurements"] to
-- PostgREST. A view has no RLS of its own and runs with its owner's rights, so
-- `v_report_learners` sitting in `procurements` would be every school's
-- learner roster — names, LRNs, birthdates, guardians — readable by any
-- authenticated user holding the anon key. The views therefore live in a new
-- `reporting` schema, which is NOT exposed, and are additionally declared
-- WITH (security_invoker = true) so that even a future accidental exposure
-- reads through the caller's own RLS instead of the owner's rights.
--
--   ⚠ PRODUCTION CHECKLIST — the exposed-schema list on a hosted project is
--     set in the Supabase dashboard (Settings → API → Exposed schemas), NOT in
--     this repo's config.toml. Before applying this migration to production,
--     confirm `reporting` is not in that list, and never add it.
--
-- WHY SECURITY DEFINER
-- --------------------
-- A division report must read every school. The school-scoped SELECT policies
-- hand a division user an empty set for every school but their own, which is
-- the exact bug 157 was written to fix, so the access decision moves out of
-- the policies and into one explicit guard (the 156/157 lesson).
-- `can_run_division_report` mirrors 157's shape: division roles for any scope,
-- and for a NAMED school additionally that school's own staff and its 134
-- assignees — which is what will let /school-reports (164) reuse this without
-- a second guard. That branch widens nothing: 041's posture already lets any
-- authenticated user read their own school's learners and staff.
--
-- `sms_users.type` is the ACTIVE role (invariant 12). The guard asks what the
-- caller is acting as right now, exactly like every other type check in the
-- system; it is never widened to "any assigned role".
--
-- WHY THE RPC RETURNS JSONB
-- -------------------------
-- A RETURNS TABLE is compared to the query's actual output types exactly, at
-- CALL time — `character varying` is not `text`, `integer` is not `bigint` —
-- which is how 156 shipped clean and failed on its first call, and 157 had to
-- cast every column to escape. A user-chosen column list makes that check
-- impossible to satisfy in advance. One `jsonb` column per row sidesteps the
-- whole class, and lands in the client as Record<string, unknown>[], which is
-- already what exportExcel and exportCsv take.
--
--   NOTE: JSONB does not preserve key order. The column ORDER the user picked
--   is the client's business; the RPC returns an object, not a tuple.
--
-- WHAT THIS TOUCHES
-- -----------------
-- Nothing. One new schema, three views over existing tables, two new metadata
-- tables, four new functions. No existing table, column, policy, trigger or
-- function is altered, and there is no DML against live data. Applying it
-- changes no figure anywhere in the system; until the builder page ships,
-- nothing calls it.
--
-- ROWS AFFECTED: 0 (DDL plus seed rows into two new, empty tables).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The unexposed schema
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS reporting;

COMMENT ON SCHEMA reporting IS
  'Wide, pre-joined read models behind the Division Report Generator (166). '
  'NEVER add this schema to PostgREST''s exposed list: its views carry every '
  'school''s learner and personnel data and have no RLS of their own. They are '
  'reachable only through procurements.division_report_run/_count, which carry '
  'the access guard.';

-- Deliberately NOT granted to `authenticated` or `anon`. The SECURITY DEFINER
-- RPCs run as the owner and reach the views that way.
GRANT USAGE ON SCHEMA reporting TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 2. Dataset views
--
-- Wide and already denormalised, so "pick your columns" is genuinely a column
-- subset and the user never designs a join. Every column is cast to the type
-- the field catalogue declares, per 157 — no-ops where the migration files were
-- right, immunity to the drift where they were not (sms_users.name is
-- `character varying`; sms_students.grade_level is TEXT while
-- sms_enrollments.grade_level is INTEGER — invariant 11).
-- ---------------------------------------------------------------------------

-- 2a. Learners — one row per student record.
CREATE OR REPLACE VIEW reporting.v_report_learners
WITH (security_invoker = true) AS
SELECT
  st.id::BIGINT                                                AS student_id,
  st.school_id::BIGINT                                         AS school_id,
  sc.name::TEXT                                                AS school_name,
  sc.district::TEXT                                            AS district,
  sc.school_type::TEXT                                         AS school_type,
  st.lrn::TEXT                                                 AS lrn,
  TRIM(BOTH ' ' FROM
    COALESCE(st.last_name, '') || ', ' || COALESCE(st.first_name, '') ||
    COALESCE(' ' || NULLIF(st.middle_name, ''), '') ||
    COALESCE(' ' || NULLIF(st.suffix, ''), ''))::TEXT          AS full_name,
  st.last_name::TEXT                                           AS last_name,
  st.first_name::TEXT                                          AS first_name,
  st.middle_name::TEXT                                         AS middle_name,
  st.suffix::TEXT                                              AS suffix,
  st.gender::TEXT                                              AS sex,
  st.date_of_birth::DATE                                       AS date_of_birth,
  -- Age today. The school-year-relative age lives on the enrolment dataset,
  -- where there is a school year to be relative to.
  (date_part('year', age(CURRENT_DATE, st.date_of_birth)))::INTEGER
                                                               AS age,
  -- sms_students.grade_level is TEXT (invariant 11) and holds either a bare
  -- number or "Grade N" depending on how the row was written.
  NULLIF(regexp_replace(COALESCE(st.grade_level, ''), '\D', '', 'g'), '')::INTEGER
                                                               AS grade_level,
  sec.name::TEXT                                               AS section_name,
  st.enrollment_status::TEXT                                   AS enrollment_status,
  COALESCE(st.is_4ps, FALSE)::BOOLEAN                           AS is_4ps,
  -- 151's single definition of an IP learner, called rather than re-typed.
  procurements.is_ip_learner(st.ip_ethnic_group)::BOOLEAN       AS is_ip,
  st.ip_ethnic_group::TEXT                                     AS ip_ethnic_group,
  -- 150's PWD definition, called rather than re-typed: any LSEN tag outside
  -- the Gifted group (119), or a SNED disability record (048).
  (
    EXISTS (
      SELECT 1
      FROM procurements.sms_manifestation_tags t
      JOIN procurements.sms_manifestation_tag_items i ON i.tag_id = t.id
      WHERE t.student_id = st.id AND i.category <> 'gifted'
    )
    OR EXISTS (
      SELECT 1 FROM procurements.sms_student_disabilities d
      WHERE d.student_id = st.id
    )
  )::BOOLEAN                                                   AS is_pwd,
  st.mother_tongue::TEXT                                       AS mother_tongue,
  st.religion::TEXT                                            AS religion,
  st.purok::TEXT                                               AS purok,
  st.barangay::TEXT                                            AS barangay,
  st.municipality_city::TEXT                                   AS municipality_city,
  st.province::TEXT                                            AS province,
  st.contact_number::TEXT                                      AS contact_number,
  st.email::TEXT                                               AS email,
  st.parent_guardian_name::TEXT                                AS parent_guardian_name,
  st.parent_guardian_contact::TEXT                             AS parent_guardian_contact,
  st.parent_guardian_relationship::TEXT                        AS parent_guardian_relationship,
  NULLIF(TRIM(BOTH ' ' FROM
    COALESCE(st.father_first_name, '') || ' ' ||
    COALESCE(st.father_middle_name, '') || ' ' ||
    COALESCE(st.father_last_name, '')), '')::TEXT              AS father_name,
  NULLIF(TRIM(BOTH ' ' FROM
    COALESCE(st.mother_first_name, '') || ' ' ||
    COALESCE(st.mother_middle_name, '') || ' ' ||
    COALESCE(st.mother_last_name, '')), '')::TEXT              AS mother_name,
  st.previous_school::TEXT                                     AS previous_school,
  st.created_at::DATE                                          AS date_encoded
FROM procurements.sms_students st
LEFT JOIN procurements.sms_schools sc  ON sc.id = st.school_id
LEFT JOIN procurements.sms_sections sec ON sec.id = st.current_section_id;

COMMENT ON VIEW reporting.v_report_learners IS
  'Report Generator dataset `learners`: one row per sms_students record, '
  'pre-joined to school and current section. Reachable only through '
  'procurements.division_report_run (166).';

-- 2b. Enrolment — one row per sms_enrollments record.
CREATE OR REPLACE VIEW reporting.v_report_enrollment
WITH (security_invoker = true) AS
SELECT
  e.id::BIGINT                                                 AS enrollment_id,
  e.student_id::BIGINT                                         AS student_id,
  e.school_id::BIGINT                                          AS school_id,
  sc.name::TEXT                                                AS school_name,
  sc.district::TEXT                                            AS district,
  e.school_year::TEXT                                          AS school_year,
  e.semester::INTEGER                                          AS semester,
  e.grade_level::INTEGER                                       AS grade_level,
  sec.name::TEXT                                               AS section_name,
  sec.section_type::TEXT                                       AS section_type,
  sec.strand::TEXT                                             AS strand,
  st.lrn::TEXT                                                 AS lrn,
  TRIM(BOTH ' ' FROM
    COALESCE(st.last_name, '') || ', ' || COALESCE(st.first_name, '') ||
    COALESCE(' ' || NULLIF(st.middle_name, ''), '') ||
    COALESCE(' ' || NULLIF(st.suffix, ''), ''))::TEXT          AS full_name,
  st.gender::TEXT                                              AS sex,
  st.date_of_birth::DATE                                       AS date_of_birth,
  -- Age as of 1 June of the school year opening, which is the age every DepEd
  -- form reports. NULL rather than an error when school_year is malformed.
  (date_part('year', age(
     make_date(NULLIF(substring(e.school_year FROM '^\d{4}'), '')::INTEGER, 6, 1),
     st.date_of_birth)))::INTEGER                              AS age_at_sy_start,
  e.status::TEXT                                               AS status,
  e.enrollment_status::TEXT                                    AS enrollment_status,
  e.enrollment_date::DATE                                      AS enrollment_date,
  COALESCE(e.is_balik_aral, FALSE)::BOOLEAN                     AS is_balik_aral,
  (e.origin_school_id IS NOT NULL)::BOOLEAN                     AS is_transfer_in,
  osc.name::TEXT                                               AS origin_school_name,
  dsc.name::TEXT                                               AS transfer_destination_school_name,
  e.transfer_date::DATE                                        AS transfer_date,
  e.date_dropped::DATE                                         AS date_dropped,
  COALESCE(st.is_4ps, FALSE)::BOOLEAN                           AS is_4ps,
  procurements.is_ip_learner(st.ip_ethnic_group)::BOOLEAN       AS is_ip,
  e.remarks::TEXT                                              AS remarks
FROM procurements.sms_enrollments e
JOIN      procurements.sms_students st  ON st.id = e.student_id
LEFT JOIN procurements.sms_schools sc   ON sc.id = e.school_id
LEFT JOIN procurements.sms_schools osc  ON osc.id = e.origin_school_id
LEFT JOIN procurements.sms_schools dsc  ON dsc.id = e.transfer_destination_school_id
LEFT JOIN procurements.sms_sections sec ON sec.id = e.section_id;

COMMENT ON VIEW reporting.v_report_enrollment IS
  'Report Generator dataset `enrollment`: one row per sms_enrollments record '
  '(student x school year x semester), pre-joined to student, school, section '
  'and the origin/destination schools of a transfer. Reachable only through '
  'procurements.division_report_run (166).';

-- 2c. Staff — one row per personnel record.
CREATE OR REPLACE VIEW reporting.v_report_staff
WITH (security_invoker = true) AS
SELECT
  u.id::BIGINT                                                 AS staff_id,
  u.school_id::BIGINT                                          AS school_id,
  sc.name::TEXT                                                AS school_name,
  sc.district::TEXT                                            AS district,
  u.name::TEXT                                                 AS name,
  u.employee_id::TEXT                                          AS employee_id,
  -- The ACTIVE role (invariant 12), not the set they may hold.
  u.type::TEXT                                                 AS role,
  u.position::TEXT                                             AS position,
  u.staff_category_code::TEXT                                  AS staff_category_code,
  u.learning_area::TEXT                                        AS learning_area,
  u.gender::TEXT                                               AS sex,
  u.email::TEXT                                                AS email,
  u.phone::TEXT                                                AS phone,
  COALESCE(u.is_active, FALSE)::BOOLEAN                         AS is_active,
  u.created_at::DATE                                           AS date_added
FROM procurements.sms_users u
LEFT JOIN procurements.sms_schools sc ON sc.id = u.school_id
WHERE u.deleted_at IS NULL;

COMMENT ON VIEW reporting.v_report_staff IS
  'Report Generator dataset `staff`: one row per live sms_users record, '
  'pre-joined to school. `role` is the ACTIVE role (invariant 12), not the '
  'permitted set in sms_user_roles. Reachable only through '
  'procurements.division_report_run (166).';

-- ---------------------------------------------------------------------------
-- 3. The field catalogue — one source of truth for the UI and the RPC
--
-- The builder page reads these two tables to draw its column and filter
-- pickers, and the RPC validates against the same rows. A registry
-- hand-mirrored in lib/constants/ would have drifted; this cannot.
--
-- `field_key` IS the column name in the dataset's view. There is deliberately
-- no free SQL here (see the header).
--
-- RLS: SELECT for authenticated (these are labels), and NO write policies at
-- all — the 161 pattern — so PostgREST cannot change what a field means under
-- any role. Only a migration or service_role writes them.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS procurements.sms_report_datasets (
  key                  TEXT PRIMARY KEY,
  label                TEXT NOT NULL,
  description          TEXT,
  view_name            TEXT NOT NULL,            -- unqualified, inside `reporting`
  row_key              TEXT NOT NULL,            -- unique column, the ORDER BY tiebreak
  default_sort         TEXT NOT NULL,
  requires_school_year BOOLEAN NOT NULL DEFAULT FALSE,
  school_year_column   TEXT,                     -- which column p_school_year filters
  sort_order           INTEGER NOT NULL DEFAULT 0,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE procurements.sms_report_datasets IS
  'Report Generator (166): the datasets a division user may build a report '
  'over. `view_name` names a view in the unexposed `reporting` schema.';

CREATE TABLE IF NOT EXISTS procurements.sms_report_dataset_fields (
  id               BIGSERIAL PRIMARY KEY,
  dataset_key      TEXT NOT NULL,
  field_key        TEXT NOT NULL,                -- the column name in the view
  label            TEXT NOT NULL,
  data_type        TEXT NOT NULL,
  enum_source      TEXT,                         -- picklist key the UI resolves
  filterable       BOOLEAN NOT NULL DEFAULT TRUE,
  default_selected BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

-- Constraints added separately, per 116's lesson: CREATE TABLE IF NOT EXISTS
-- silently skips them when the table already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_report_dataset_fields_dataset_fkey'
  ) THEN
    ALTER TABLE procurements.sms_report_dataset_fields
      ADD CONSTRAINT sms_report_dataset_fields_dataset_fkey
      FOREIGN KEY (dataset_key) REFERENCES procurements.sms_report_datasets(key)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_report_dataset_fields_type_check'
  ) THEN
    ALTER TABLE procurements.sms_report_dataset_fields
      ADD CONSTRAINT sms_report_dataset_fields_type_check
      CHECK (data_type IN ('text', 'number', 'date', 'boolean', 'enum'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sms_report_dataset_fields_key_idx
  ON procurements.sms_report_dataset_fields (dataset_key, field_key);

COMMENT ON TABLE procurements.sms_report_dataset_fields IS
  'Report Generator (166): the whitelist. A column or filter the client sends '
  'must match a row here. `field_key` is a column name in the dataset''s view — '
  'never free SQL. `enum_source` is a picklist key the UI resolves against '
  'lib/constants; it carries no server-side behaviour.';

ALTER TABLE procurements.sms_report_datasets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_report_dataset_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Report datasets are viewable by authenticated users"
  ON procurements.sms_report_datasets;
CREATE POLICY "Report datasets are viewable by authenticated users"
  ON procurements.sms_report_datasets
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Report dataset fields are viewable by authenticated users"
  ON procurements.sms_report_dataset_fields;
CREATE POLICY "Report dataset fields are viewable by authenticated users"
  ON procurements.sms_report_dataset_fields
  FOR SELECT TO authenticated USING (TRUE);

-- SELECT only. No INSERT/UPDATE/DELETE grant and no write policy: the
-- catalogue is migration-owned.
GRANT SELECT ON procurements.sms_report_datasets       TO authenticated;
GRANT SELECT ON procurements.sms_report_dataset_fields TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seed the catalogue
-- ---------------------------------------------------------------------------

INSERT INTO procurements.sms_report_datasets
  (key, label, description, view_name, row_key, default_sort,
   requires_school_year, school_year_column, sort_order)
VALUES
  ('learners', 'Learners',
   'One row per learner record, with school, section, address, guardian and the 4Ps / IP / PWD flags.',
   'v_report_learners', 'student_id', 'full_name', FALSE, NULL, 10),
  ('enrollment', 'Enrolment',
   'One row per enrolment (learner x school year x semester), with status, section, transfer and balik-aral detail.',
   'v_report_enrollment', 'enrollment_id', 'full_name', TRUE, 'school_year', 20),
  ('staff', 'Personnel',
   'One row per personnel record, with role, position, plantilla category, specialization and contact details.',
   'v_report_staff', 'staff_id', 'name', FALSE, NULL, 30)
ON CONFLICT (key) DO UPDATE SET
  label                = EXCLUDED.label,
  description          = EXCLUDED.description,
  view_name            = EXCLUDED.view_name,
  row_key              = EXCLUDED.row_key,
  default_sort         = EXCLUDED.default_sort,
  requires_school_year = EXCLUDED.requires_school_year,
  school_year_column   = EXCLUDED.school_year_column,
  sort_order           = EXCLUDED.sort_order,
  is_active            = TRUE;

INSERT INTO procurements.sms_report_dataset_fields
  (dataset_key, field_key, label, data_type, enum_source, filterable, default_selected, sort_order)
VALUES
  -- learners ---------------------------------------------------------------
  ('learners', 'student_id',      'Student ID',            'number',  NULL,                 FALSE, FALSE,   5),
  ('learners', 'school_name',     'School',                'text',    NULL,                 TRUE,  TRUE,   10),
  ('learners', 'district',        'District',              'enum',    'district',           TRUE,  FALSE,  20),
  ('learners', 'school_type',     'School Type',           'enum',    'school_type',        TRUE,  FALSE,  30),
  ('learners', 'lrn',             'LRN',                   'text',    NULL,                 TRUE,  TRUE,   40),
  ('learners', 'full_name',       'Name',                  'text',    NULL,                 TRUE,  TRUE,   50),
  ('learners', 'last_name',       'Last Name',             'text',    NULL,                 TRUE,  FALSE,  60),
  ('learners', 'first_name',      'First Name',            'text',    NULL,                 TRUE,  FALSE,  70),
  ('learners', 'middle_name',     'Middle Name',           'text',    NULL,                 TRUE,  FALSE,  80),
  ('learners', 'suffix',          'Suffix',                'text',    NULL,                 TRUE,  FALSE,  90),
  ('learners', 'sex',             'Sex',                   'enum',    'sex',                TRUE,  TRUE,  100),
  ('learners', 'date_of_birth',   'Date of Birth',         'date',    NULL,                 TRUE,  FALSE, 110),
  ('learners', 'age',             'Age (today)',           'number',  NULL,                 TRUE,  FALSE, 120),
  ('learners', 'grade_level',     'Grade Level',           'number',  'grade_level',        TRUE,  TRUE,  130),
  ('learners', 'section_name',    'Section',               'text',    NULL,                 TRUE,  TRUE,  140),
  ('learners', 'enrollment_status', 'Learner Status',      'enum',    'learner_status',     TRUE,  FALSE, 150),
  ('learners', 'is_4ps',          '4Ps',                   'boolean', NULL,                 TRUE,  FALSE, 160),
  ('learners', 'is_ip',           'IP',                    'boolean', NULL,                 TRUE,  FALSE, 170),
  ('learners', 'ip_ethnic_group', 'IP Group',              'text',    NULL,                 TRUE,  FALSE, 180),
  ('learners', 'is_pwd',          'PWD / LSEN',            'boolean', NULL,                 TRUE,  FALSE, 190),
  ('learners', 'mother_tongue',   'Mother Tongue',         'text',    NULL,                 TRUE,  FALSE, 200),
  ('learners', 'religion',        'Religion',              'text',    NULL,                 TRUE,  FALSE, 210),
  ('learners', 'purok',           'Purok',                 'text',    NULL,                 TRUE,  FALSE, 220),
  ('learners', 'barangay',        'Barangay',              'text',    NULL,                 TRUE,  FALSE, 230),
  ('learners', 'municipality_city', 'Municipality / City', 'text',    NULL,                 TRUE,  FALSE, 240),
  ('learners', 'province',        'Province',              'text',    NULL,                 TRUE,  FALSE, 250),
  ('learners', 'contact_number',  'Contact Number',        'text',    NULL,                 TRUE,  FALSE, 260),
  ('learners', 'email',           'Email',                 'text',    NULL,                 TRUE,  FALSE, 270),
  ('learners', 'parent_guardian_name',         'Parent / Guardian',          'text', NULL,   TRUE,  FALSE, 280),
  ('learners', 'parent_guardian_contact',      'Parent / Guardian Contact',  'text', NULL,   TRUE,  FALSE, 290),
  ('learners', 'parent_guardian_relationship', 'Relationship',               'text', NULL,   TRUE,  FALSE, 300),
  ('learners', 'father_name',     'Father',                'text',    NULL,                 TRUE,  FALSE, 310),
  ('learners', 'mother_name',     'Mother',                'text',    NULL,                 TRUE,  FALSE, 320),
  ('learners', 'previous_school', 'Previous School',       'text',    NULL,                 TRUE,  FALSE, 330),
  ('learners', 'date_encoded',    'Date Encoded',          'date',    NULL,                 TRUE,  FALSE, 340),

  -- enrollment -------------------------------------------------------------
  ('enrollment', 'enrollment_id',  'Enrolment ID',         'number',  NULL,                 FALSE, FALSE,   5),
  ('enrollment', 'student_id',     'Student ID',           'number',  NULL,                 FALSE, FALSE,   6),
  ('enrollment', 'school_name',    'School',               'text',    NULL,                 TRUE,  TRUE,   10),
  ('enrollment', 'district',       'District',             'enum',    'district',           TRUE,  FALSE,  20),
  ('enrollment', 'school_year',    'School Year',          'text',    NULL,                 TRUE,  FALSE,  30),
  ('enrollment', 'semester',       'Semester',             'number',  'semester',           TRUE,  FALSE,  40),
  ('enrollment', 'grade_level',    'Grade Level',          'number',  'grade_level',        TRUE,  TRUE,   50),
  ('enrollment', 'section_name',   'Section',              'text',    NULL,                 TRUE,  TRUE,   60),
  ('enrollment', 'section_type',   'Section Type',         'enum',    'section_type',       TRUE,  FALSE,  70),
  ('enrollment', 'strand',         'Strand',               'enum',    'strand',             TRUE,  FALSE,  80),
  ('enrollment', 'lrn',            'LRN',                  'text',    NULL,                 TRUE,  TRUE,   90),
  ('enrollment', 'full_name',      'Name',                 'text',    NULL,                 TRUE,  TRUE,  100),
  ('enrollment', 'sex',            'Sex',                  'enum',    'sex',                TRUE,  TRUE,  110),
  ('enrollment', 'date_of_birth',  'Date of Birth',        'date',    NULL,                 TRUE,  FALSE, 120),
  ('enrollment', 'age_at_sy_start','Age (as of 1 June)',   'number',  NULL,                 TRUE,  FALSE, 130),
  ('enrollment', 'status',         'Approval',             'enum',    'enrollment_approval', TRUE, FALSE, 140),
  ('enrollment', 'enrollment_status', 'Enrolment Status',  'enum',    'enrollment_lifecycle', TRUE, TRUE, 150),
  ('enrollment', 'enrollment_date','Date Enrolled',        'date',    NULL,                 TRUE,  FALSE, 160),
  ('enrollment', 'is_balik_aral',  'Balik-Aral',           'boolean', NULL,                 TRUE,  FALSE, 170),
  ('enrollment', 'is_transfer_in', 'Transfer In',          'boolean', NULL,                 TRUE,  FALSE, 180),
  ('enrollment', 'origin_school_name', 'Origin School',    'text',    NULL,                 TRUE,  FALSE, 190),
  ('enrollment', 'transfer_destination_school_name', 'Destination School', 'text', NULL,    TRUE,  FALSE, 200),
  ('enrollment', 'transfer_date',  'Transfer Date',        'date',    NULL,                 TRUE,  FALSE, 210),
  ('enrollment', 'date_dropped',   'Date Dropped',         'date',    NULL,                 TRUE,  FALSE, 220),
  ('enrollment', 'is_4ps',         '4Ps',                  'boolean', NULL,                 TRUE,  FALSE, 230),
  ('enrollment', 'is_ip',          'IP',                   'boolean', NULL,                 TRUE,  FALSE, 240),
  ('enrollment', 'remarks',        'Remarks',              'text',    NULL,                 TRUE,  FALSE, 250),

  -- staff ------------------------------------------------------------------
  ('staff', 'staff_id',            'Staff ID',             'number',  NULL,                 FALSE, FALSE,   5),
  ('staff', 'school_name',         'School',               'text',    NULL,                 TRUE,  TRUE,   10),
  ('staff', 'district',            'District',             'enum',    'district',           TRUE,  FALSE,  20),
  ('staff', 'name',                'Name',                 'text',    NULL,                 TRUE,  TRUE,   30),
  ('staff', 'employee_id',         'Employee ID',          'text',    NULL,                 TRUE,  TRUE,   40),
  ('staff', 'role',                'Role',                 'enum',    'user_type',          TRUE,  TRUE,   50),
  ('staff', 'position',            'Position',             'text',    NULL,                 TRUE,  TRUE,   60),
  ('staff', 'staff_category_code', 'Plantilla Category',   'enum',    'staff_category',     TRUE,  FALSE,  70),
  ('staff', 'learning_area',       'Specialization',       'enum',    'learning_area',      TRUE,  FALSE,  80),
  ('staff', 'sex',                 'Sex',                  'enum',    'sex',                TRUE,  TRUE,   90),
  ('staff', 'email',               'Email',                'text',    NULL,                 TRUE,  FALSE, 100),
  ('staff', 'phone',               'Phone',                'text',    NULL,                 TRUE,  FALSE, 110),
  ('staff', 'is_active',           'Active',               'boolean', NULL,                 TRUE,  FALSE, 120),
  ('staff', 'date_added',          'Date Added',           'date',    NULL,                 TRUE,  FALSE, 130)
ON CONFLICT (dataset_key, field_key) DO UPDATE SET
  label            = EXCLUDED.label,
  data_type        = EXCLUDED.data_type,
  enum_source      = EXCLUDED.enum_source,
  filterable       = EXCLUDED.filterable,
  default_selected = EXCLUDED.default_selected,
  sort_order       = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- 5. Operators — the same list the UI draws its dropdown from
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.division_report_operators(p_data_type TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_data_type
    WHEN 'text'    THEN ARRAY['eq','neq','contains','starts_with','ends_with','in','not_in','is_null','not_null']
    WHEN 'enum'    THEN ARRAY['eq','neq','in','not_in','is_null','not_null']
    WHEN 'number'  THEN ARRAY['eq','neq','gt','gte','lt','lte','between','in','not_in','is_null','not_null']
    WHEN 'date'    THEN ARRAY['eq','neq','gt','gte','lt','lte','between','is_null','not_null']
    WHEN 'boolean' THEN ARRAY['eq','is_null','not_null']
    ELSE ARRAY[]::TEXT[]
  END;
$$;

COMMENT ON FUNCTION procurements.division_report_operators(TEXT) IS
  'Report Generator (166): the operators legal for a field of this data type. '
  'The builder UI reads this to draw its operator dropdown and the WHERE '
  'builder validates against it, so the two cannot disagree.';

-- ---------------------------------------------------------------------------
-- 6. The guard — 157's shape, and the only access decision in the module
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.can_run_division_report(p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_is_division BOOLEAN;
BEGIN
  -- `type` is the ACTIVE role (invariant 12), never the permitted set.
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND u.type IN ('division_admin', 'super admin', 'division_type')
  ) INTO v_is_division;

  IF v_is_division THEN
    RETURN TRUE;
  END IF;

  -- Division-wide is division work.
  IF p_school_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- One named school: its own staff and its 134 assignees may read it too,
  -- which is what will let /school-reports (164) reuse this RPC. Widens
  -- nothing — 041's posture already lets them read their own school's rows.
  RETURN EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND (
        u.school_id = p_school_id
        OR EXISTS (
          SELECT 1 FROM procurements.sms_user_schools us
          WHERE us.user_id = u.id AND us.school_id = p_school_id
        )
      )
  );
END;
$$;

COMMENT ON FUNCTION procurements.can_run_division_report(BIGINT) IS
  'Report Generator (166): may the caller run a report at this scope? NULL '
  'school = division-wide, admitted only to division_admin / super admin / '
  'division_type; a named school additionally admits that school''s own staff '
  'and its migration-134 assignees.';

-- ---------------------------------------------------------------------------
-- 7. The WHERE builder
--
-- Internal. Every identifier it emits has already matched the catalogue and is
-- rendered through %I; every value goes through %L, and an ILIKE pattern is
-- additionally escaped for the wildcards. An unrecognised field or operator
-- RAISES rather than being dropped: a dropped filter silently WIDENS the
-- result, which is the one failure mode that must never be quiet.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.division_report_where(
  p_dataset     TEXT,
  p_filters     JSONB,
  p_school_id   BIGINT,
  p_school_year TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = procurements, public
AS $$
DECLARE
  v_bs      CONSTANT TEXT := chr(92);   -- a single backslash, unambiguously
  v_ds      RECORD;
  v_clauses TEXT[] := ARRAY[]::TEXT[];
  v_filter  JSONB;
  v_field   TEXT;
  v_op      TEXT;
  v_type    TEXT;
  v_val     TEXT;
  v_vals    TEXT[];
  v_pattern TEXT;
BEGIN
  SELECT * INTO v_ds
  FROM procurements.sms_report_datasets
  WHERE key = p_dataset AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown report dataset: %', COALESCE(p_dataset, '(null)');
  END IF;

  -- Scope. Every dataset view exposes school_id; the self-test at the foot of
  -- this migration enforces that.
  IF p_school_id IS NOT NULL THEN
    v_clauses := v_clauses || format('school_id = %L::BIGINT', p_school_id);
  END IF;

  IF NULLIF(btrim(COALESCE(p_school_year, '')), '') IS NULL THEN
    IF v_ds.requires_school_year THEN
      RAISE EXCEPTION 'A school year is required for the % dataset.', v_ds.label;
    END IF;
  ELSIF v_ds.school_year_column IS NOT NULL THEN
    v_clauses := v_clauses || format('%I = %L', v_ds.school_year_column, btrim(p_school_year));
  END IF;

  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) <> 'array' THEN
    RAISE EXCEPTION 'Report filters must be a JSON array.';
  END IF;

  FOR v_filter IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_filters, '[]'::JSONB))
  LOOP
    v_field := v_filter->>'field';
    v_op    := lower(btrim(COALESCE(v_filter->>'op', '')));

    SELECT f.data_type INTO v_type
    FROM procurements.sms_report_dataset_fields f
    WHERE f.dataset_key = p_dataset
      AND f.field_key = v_field
      AND f.filterable;

    IF v_type IS NULL THEN
      RAISE EXCEPTION 'Unknown or non-filterable report field: %',
        COALESCE(v_field, '(null)');
    END IF;

    IF NOT (v_op = ANY (procurements.division_report_operators(v_type))) THEN
      RAISE EXCEPTION 'Operator "%" is not valid for the % field "%".',
        v_op, v_type, v_field;
    END IF;

    IF v_op IN ('is_null', 'not_null') THEN
      v_clauses := v_clauses || format(
        '%I IS %s NULL', v_field, CASE WHEN v_op = 'is_null' THEN '' ELSE 'NOT' END);

    ELSIF v_op IN ('in', 'not_in', 'between') THEN
      IF jsonb_typeof(v_filter->'value') <> 'array' THEN
        RAISE EXCEPTION 'The "%" operator on "%" needs an array of values.', v_op, v_field;
      END IF;

      SELECT array_agg(x) INTO v_vals
      FROM jsonb_array_elements_text(v_filter->'value') AS x;

      IF v_vals IS NULL OR array_length(v_vals, 1) IS NULL THEN
        RAISE EXCEPTION 'The "%" operator on "%" was given no values.', v_op, v_field;
      END IF;

      IF v_op = 'between' THEN
        IF array_length(v_vals, 1) <> 2 THEN
          RAISE EXCEPTION 'The "between" operator on "%" needs exactly two values.', v_field;
        END IF;
        v_clauses := v_clauses || format(
          '%I BETWEEN %L AND %L', v_field, v_vals[1], v_vals[2]);
      ELSE
        -- IN, not = ANY(ARRAY[...]): the unknown-typed literals inside IN
        -- coerce to the column's own type, so an integer column stays
        -- comparable to an integer and the index stays usable.
        v_clauses := v_clauses || format(
          '%I %s (%s)',
          v_field,
          CASE WHEN v_op = 'in' THEN 'IN' ELSE 'NOT IN' END,
          (SELECT string_agg(quote_literal(x), ', ') FROM unnest(v_vals) AS x));
      END IF;

    ELSIF v_op IN ('contains', 'starts_with', 'ends_with') THEN
      v_val := v_filter->>'value';
      IF v_val IS NULL THEN
        RAISE EXCEPTION 'The "%" operator on "%" needs a value.', v_op, v_field;
      END IF;
      -- Escape the wildcards, then declare the escape character explicitly —
      -- the server half of escapeIlikePattern().
      v_val := replace(v_val, v_bs, v_bs || v_bs);
      v_val := replace(v_val, '%', v_bs || '%');
      v_val := replace(v_val, '_', v_bs || '_');
      v_pattern := CASE v_op
        WHEN 'contains'    THEN '%' || v_val || '%'
        WHEN 'starts_with' THEN v_val || '%'
        ELSE                    '%' || v_val
      END;
      v_clauses := v_clauses || format(
        '%I ILIKE %L ESCAPE %L', v_field, v_pattern, v_bs);

    ELSE
      v_val := v_filter->>'value';
      IF v_val IS NULL THEN
        RAISE EXCEPTION 'The "%" operator on "%" needs a value.', v_op, v_field;
      END IF;
      v_clauses := v_clauses || format(
        '%I %s %L',
        v_field,
        CASE v_op
          WHEN 'eq'  THEN '='
          WHEN 'neq' THEN '<>'
          WHEN 'gt'  THEN '>'
          WHEN 'gte' THEN '>='
          WHEN 'lt'  THEN '<'
          WHEN 'lte' THEN '<='
        END,
        v_val);
    END IF;
  END LOOP;

  IF array_length(v_clauses, 1) IS NULL THEN
    RETURN '';
  END IF;

  RETURN 'WHERE ' || array_to_string(v_clauses, ' AND ');
END;
$$;

COMMENT ON FUNCTION procurements.division_report_where(TEXT, JSONB, BIGINT, TEXT) IS
  'Report Generator (166), internal: turns a validated filter array into a '
  'WHERE clause. Not granted to any client role — only the SECURITY DEFINER '
  'RPCs call it.';

-- ---------------------------------------------------------------------------
-- 8. The RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.division_report_run(
  p_dataset     TEXT,
  p_columns     TEXT[] DEFAULT NULL,
  p_filters     JSONB  DEFAULT '[]'::JSONB,
  p_school_id   BIGINT DEFAULT NULL,
  p_school_year TEXT   DEFAULT NULL,
  p_sort_field  TEXT   DEFAULT NULL,
  p_sort_dir    TEXT   DEFAULT 'asc',
  p_limit       INTEGER DEFAULT 1000,
  p_offset      INTEGER DEFAULT 0
)
RETURNS TABLE (row_data JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, reporting, public
AS $$
DECLARE
  v_ds     RECORD;
  v_cols   TEXT[];
  v_extra  TEXT[] := ARRAY[]::TEXT[];   -- sort helpers added to the row, stripped from the JSON
  v_sort   TEXT;
  v_dir    TEXT;
  v_limit  INTEGER;
  v_offset INTEGER;
  v_sql    TEXT;
BEGIN
  IF NOT procurements.can_run_division_report(p_school_id) THEN
    RAISE EXCEPTION 'You may not run division reports at this scope.';
  END IF;

  SELECT * INTO v_ds
  FROM procurements.sms_report_datasets
  WHERE key = p_dataset AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown report dataset: %', COALESCE(p_dataset, '(null)');
  END IF;

  -- Columns: an unrecognised one is DROPPED (it loses a column and nothing
  -- else), unlike a filter, which raises.
  IF p_columns IS NOT NULL AND array_length(p_columns, 1) IS NOT NULL THEN
    SELECT array_agg(f.field_key ORDER BY f.sort_order, f.field_key) INTO v_cols
    FROM procurements.sms_report_dataset_fields f
    WHERE f.dataset_key = p_dataset AND f.field_key = ANY (p_columns);
  END IF;

  IF v_cols IS NULL THEN
    SELECT array_agg(f.field_key ORDER BY f.sort_order, f.field_key) INTO v_cols
    FROM procurements.sms_report_dataset_fields f
    WHERE f.dataset_key = p_dataset AND f.default_selected;
  END IF;

  IF v_cols IS NULL THEN
    SELECT array_agg(f.field_key ORDER BY f.sort_order, f.field_key) INTO v_cols
    FROM procurements.sms_report_dataset_fields f
    WHERE f.dataset_key = p_dataset;
  END IF;

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'The % dataset has no fields.', v_ds.label;
  END IF;

  -- Sort. An unrecognised sort field falls back to the dataset default rather
  -- than raising: it is a display choice, not a correctness one.
  SELECT f.field_key INTO v_sort
  FROM procurements.sms_report_dataset_fields f
  WHERE f.dataset_key = p_dataset AND f.field_key = p_sort_field;
  v_sort := COALESCE(v_sort, v_ds.default_sort);
  v_dir  := CASE WHEN lower(btrim(COALESCE(p_sort_dir, 'asc'))) = 'desc' THEN 'DESC' ELSE 'ASC' END;

  -- The sort column and the row key must be in the subquery for the outer
  -- ORDER BY to see them; anything the user did not ask for is deleted from
  -- the JSON afterwards.
  IF NOT (v_sort = ANY (v_cols)) THEN
    v_extra := v_extra || v_sort;
  END IF;
  IF NOT (v_ds.row_key = ANY (v_cols)) AND v_ds.row_key <> v_sort THEN
    v_extra := v_extra || v_ds.row_key;
  END IF;

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  v_sql := format(
    'SELECT to_jsonb(sub) - %L::TEXT[] FROM (SELECT %s FROM reporting.%I %s) sub '
    || 'ORDER BY %I %s NULLS LAST, %I ASC LIMIT %s OFFSET %s',
    v_extra,
    (SELECT string_agg(format('%I', c), ', ')
       FROM unnest(v_cols || v_extra) AS c),
    v_ds.view_name,
    procurements.division_report_where(p_dataset, p_filters, p_school_id, p_school_year),
    v_sort, v_dir, v_ds.row_key,
    v_limit, v_offset);

  RETURN QUERY EXECUTE v_sql;
END;
$$;

COMMENT ON FUNCTION procurements.division_report_run(TEXT, TEXT[], JSONB, BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER) IS
  'Report Generator (166): runs one report and returns a JSONB object per row. '
  'JSONB does not preserve key order — the column order the user picked is the '
  'client''s business. p_limit is clamped to 5000; page with p_offset.';

CREATE OR REPLACE FUNCTION procurements.division_report_count(
  p_dataset     TEXT,
  p_filters     JSONB  DEFAULT '[]'::JSONB,
  p_school_id   BIGINT DEFAULT NULL,
  p_school_year TEXT   DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, reporting, public
AS $$
DECLARE
  v_ds    RECORD;
  v_count BIGINT;
BEGIN
  IF NOT procurements.can_run_division_report(p_school_id) THEN
    RAISE EXCEPTION 'You may not run division reports at this scope.';
  END IF;

  SELECT * INTO v_ds
  FROM procurements.sms_report_datasets
  WHERE key = p_dataset AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown report dataset: %', COALESCE(p_dataset, '(null)');
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM reporting.%I %s',
    v_ds.view_name,
    procurements.division_report_where(p_dataset, p_filters, p_school_id, p_school_year))
  INTO v_count;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION procurements.division_report_count(TEXT, JSONB, BIGINT, TEXT) IS
  'Report Generator (166): the unpaginated row count for the same dataset, '
  'filters and scope division_report_run would return.';

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION procurements.division_report_where(TEXT, JSONB, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION procurements.division_report_run(TEXT, TEXT[], JSONB, BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION procurements.division_report_count(TEXT, JSONB, BIGINT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION procurements.division_report_operators(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.can_run_division_report(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION
  procurements.division_report_run(TEXT, TEXT[], JSONB, BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  procurements.division_report_count(TEXT, JSONB, BIGINT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Self-test — fail at APPLY time, never at call time
--
-- The 156 lesson: a catalogue that names a column the view does not have
-- created cleanly and blew up the first time a user pressed Run. This asserts
-- the catalogue against the views' actual columns while the migration is still
-- in front of whoever is applying it.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_ds      RECORD;
  v_missing TEXT;
BEGIN
  FOR v_ds IN SELECT * FROM procurements.sms_report_datasets LOOP
    IF to_regclass('reporting.' || quote_ident(v_ds.view_name)) IS NULL THEN
      RAISE EXCEPTION 'Dataset "%" names a view that does not exist: reporting.%',
        v_ds.key, v_ds.view_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'reporting' AND c.table_name = v_ds.view_name
        AND c.column_name = 'school_id'
    ) THEN
      RAISE EXCEPTION 'Dataset view reporting.% has no school_id column; every '
        'dataset must be school-scopable.', v_ds.view_name;
    END IF;

    SELECT string_agg(f.field_key, ', ') INTO v_missing
    FROM procurements.sms_report_dataset_fields f
    WHERE f.dataset_key = v_ds.key
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'reporting' AND c.table_name = v_ds.view_name
          AND c.column_name = f.field_key
      );

    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Dataset "%" catalogues fields reporting.% does not have: %',
        v_ds.key, v_ds.view_name, v_missing;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM procurements.sms_report_dataset_fields f
      WHERE f.dataset_key = v_ds.key AND f.field_key = v_ds.row_key
    ) THEN
      RAISE EXCEPTION 'Dataset "%" has row_key "%" which is not a catalogued field.',
        v_ds.key, v_ds.row_key;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM procurements.sms_report_dataset_fields f
      WHERE f.dataset_key = v_ds.key AND f.field_key = v_ds.default_sort
    ) THEN
      RAISE EXCEPTION 'Dataset "%" has default_sort "%" which is not a catalogued field.',
        v_ds.key, v_ds.default_sort;
    END IF;
  END LOOP;
END $$;
