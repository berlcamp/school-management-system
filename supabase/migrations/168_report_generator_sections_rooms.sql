-- ============================================================================
-- 168. Report Generator: the Sections and Rooms datasets
-- ============================================================================
--
-- WHY
-- ---
-- 166 shipped three datasets — learners, enrolment, personnel — which is the
-- roster half of what the SDO is asked for. The other half is the physical and
-- organisational plant: "list every Grade 7 section with its adviser and its
-- room", "every condemned classroom in the district". Both were reachable only
-- by opening each school's own Sections or Rooms module one school at a time.
--
-- NO CODE CHANGE IS REQUIRED FOR THE MECHANISM
-- --------------------------------------------
-- The builder draws its pickers from the catalogue tables, so a dataset is a
-- migration and nothing else. The one client-side addition is a picklist of
-- room conditions for the filter dropdown; a field whose `enum_source` the UI
-- does not recognise simply falls back to a free-text box, which is why adding
-- a dataset never has to wait on a deploy.
--
-- THE SECTION LEARNER COUNT AGREES WITH 165, DELIBERATELY
-- ------------------------------------------------------
-- `learners_enrolled` uses 165's own attribution: one row per learner per
-- school year, picked with DISTINCT ON ... ORDER BY semester DESC so an SHS
-- learner is counted once and attributed to their LATEST section. Counting
-- every enrolment row that names the section would put a learner who changed
-- section in November into both, and the Report Generator would then disagree
-- with the Enrolment report's own section drill-down about the same school.
-- The lifecycle predicate is 165's `enrollment` category, copied here in SQL
-- beside it rather than re-derived (the 148/165 rule).
--
-- Verified against `division_enrollment_sections` on the clone: every populated
-- section matches to the learner. The two lists differ in one way, by design —
-- 165 lists sections that HAVE learners, this lists sections, so an empty
-- section appears here with 0 and does not appear there at all. That is the
-- difference between a roll-up and an inventory, not a disagreement.
--
-- WHY ROOMS CARRIES NO SECTION COUNT
-- ----------------------------------
-- A room has no school year; a section does (137 put `room_id` on the section,
-- not the year on the room). "How many sections use this room" is therefore a
-- question with no year in it, and any answer would silently span every year in
-- the database. Rooms stays what it is — an inventory — and the section↔room
-- pairing is reported from the Sections side, where the year exists.
--
-- WHAT THIS TOUCHES
-- -----------------
-- Nothing. Two views in the unexposed `reporting` schema and their catalogue
-- rows. No existing table, column, policy, trigger, function or view is
-- altered; no DML against live data. Requires 166.
--
-- ROWS AFFECTED: 0 (DDL plus seed rows into 166's catalogue).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sections
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW reporting.v_report_sections
WITH (security_invoker = true) AS
WITH learner_section AS (
  -- One row per learner per school year, attributed to their latest section —
  -- 165's rule, so the two modules cannot disagree about the same section.
  SELECT DISTINCT ON (e.school_year, e.school_id, e.student_id)
    e.school_year,
    e.school_id,
    e.student_id,
    e.section_id
  FROM procurements.sms_enrollments e
  WHERE e.section_id IS NOT NULL
    AND e.enrollment_status IN (
      'active', 'completed', 'promoted', 'retained', 'graduated'
    )
  ORDER BY e.school_year, e.school_id, e.student_id, e.semester DESC NULLS LAST
),
section_counts AS (
  SELECT section_id, COUNT(*)::INTEGER AS learners
  FROM learner_section
  GROUP BY section_id
)
SELECT
  sec.id::BIGINT                                               AS section_id,
  sec.school_id::BIGINT                                        AS school_id,
  sc.name::TEXT                                                AS school_name,
  sc.district::TEXT                                            AS district,
  sec.school_year::TEXT                                        AS school_year,
  sec.name::TEXT                                               AS section_name,
  sec.grade_level::INTEGER                                     AS grade_level,
  sec.section_type::TEXT                                       AS section_type,
  sec.strand::TEXT                                             AS strand,
  sec.specialization::TEXT                                     AS specialization,
  adv.name::TEXT                                               AS adviser_name,
  adv.position::TEXT                                           AS adviser_position,
  adv.gender::TEXT                                             AS adviser_sex,
  rm.name::TEXT                                                AS room_name,
  rm.building::TEXT                                            AS room_building,
  sec.max_students::INTEGER                                    AS max_students,
  COALESCE(cnt.learners, 0)::INTEGER                           AS learners_enrolled,
  COALESCE(sec.is_active, FALSE)::BOOLEAN                       AS is_active,
  sec.created_at::DATE                                         AS date_created
FROM procurements.sms_sections sec
LEFT JOIN procurements.sms_schools sc  ON sc.id = sec.school_id
LEFT JOIN procurements.sms_users adv   ON adv.id = sec.section_adviser_id
LEFT JOIN procurements.sms_rooms rm    ON rm.id = sec.room_id
LEFT JOIN section_counts cnt           ON cnt.section_id = sec.id;

COMMENT ON VIEW reporting.v_report_sections IS
  'Report Generator dataset `sections` (168): one row per section, pre-joined '
  'to school, adviser and room. `learners_enrolled` uses 165''s attribution — '
  'one row per learner per year, latest section — so it agrees with the '
  'Enrolment report''s section drill-down.';

-- ---------------------------------------------------------------------------
-- 2. Rooms
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW reporting.v_report_rooms
WITH (security_invoker = true) AS
SELECT
  rm.id::BIGINT                                                AS room_id,
  rm.school_id::BIGINT                                         AS school_id,
  sc.name::TEXT                                                AS school_name,
  sc.district::TEXT                                            AS district,
  sc.school_type::TEXT                                         AS school_type,
  rm.name::TEXT                                                AS room_name,
  rm.building::TEXT                                            AS building,
  rm.room_type::TEXT                                           AS room_type,
  -- 071's four values. The NSBI's own seven-value building list and five-value
  -- room list (154) live only on that module's tables and are not this column.
  rm.condition::TEXT                                           AS condition,
  rm.capacity::INTEGER                                         AS capacity,
  -- Free text, "40 x 30" metres, transcribed from the building inventory as
  -- one value and printed back verbatim (137).
  rm.dimension::TEXT                                           AS dimension,
  rm.description::TEXT                                         AS description,
  COALESCE(rm.is_active, FALSE)::BOOLEAN                        AS is_active,
  rm.created_at::DATE                                          AS date_added
FROM procurements.sms_rooms rm
LEFT JOIN procurements.sms_schools sc ON sc.id = rm.school_id;

COMMENT ON VIEW reporting.v_report_rooms IS
  'Report Generator dataset `rooms` (168): one row per room. An inventory — a '
  'room carries no school year, so it deliberately carries no section count.';

-- ---------------------------------------------------------------------------
-- 3. Catalogue
-- ---------------------------------------------------------------------------

INSERT INTO procurements.sms_report_datasets
  (key, label, description, view_name, row_key, default_sort,
   requires_school_year, school_year_column, sort_order)
VALUES
  ('sections', 'Sections',
   'One row per section, with its adviser, its room, its size and how many learners it holds.',
   'v_report_sections', 'section_id', 'section_name', TRUE, 'school_year', 40),
  ('rooms', 'Rooms',
   'Room inventory: type, condition, capacity and dimension, per school.',
   'v_report_rooms', 'room_id', 'room_name', FALSE, NULL, 50)
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
  -- sections ---------------------------------------------------------------
  ('sections', 'section_id',        'Section ID',        'number',  NULL,           FALSE, FALSE,   5),
  ('sections', 'school_name',       'School',            'text',    NULL,           TRUE,  TRUE,   10),
  ('sections', 'district',          'District',          'enum',    'district',     TRUE,  FALSE,  20),
  ('sections', 'school_year',       'School Year',       'text',    NULL,           TRUE,  FALSE,  30),
  ('sections', 'grade_level',       'Grade Level',       'number',  'grade_level',  TRUE,  TRUE,   40),
  ('sections', 'section_name',      'Section',           'text',    NULL,           TRUE,  TRUE,   50),
  ('sections', 'section_type',      'Section Type',      'enum',    'section_type', TRUE,  FALSE,  60),
  ('sections', 'strand',            'Strand',            'enum',    'strand',       TRUE,  FALSE,  70),
  ('sections', 'specialization',    'Specialization',    'text',    NULL,           TRUE,  FALSE,  80),
  ('sections', 'adviser_name',      'Adviser',           'text',    NULL,           TRUE,  TRUE,   90),
  ('sections', 'adviser_position',  'Adviser Position',  'text',    NULL,           TRUE,  FALSE, 100),
  ('sections', 'adviser_sex',       'Adviser Sex',       'enum',    'sex',          TRUE,  FALSE, 110),
  ('sections', 'room_name',         'Room',              'text',    NULL,           TRUE,  TRUE,  120),
  ('sections', 'room_building',     'Building',          'text',    NULL,           TRUE,  FALSE, 130),
  ('sections', 'max_students',      'Capacity',          'number',  NULL,           TRUE,  FALSE, 140),
  ('sections', 'learners_enrolled', 'Learners',          'number',  NULL,           TRUE,  TRUE,  150),
  ('sections', 'is_active',         'Active',            'boolean', NULL,           TRUE,  FALSE, 160),
  ('sections', 'date_created',      'Date Created',      'date',    NULL,           TRUE,  FALSE, 170),

  -- rooms ------------------------------------------------------------------
  ('rooms', 'room_id',     'Room ID',     'number',  NULL,              FALSE, FALSE,   5),
  ('rooms', 'school_name', 'School',      'text',    NULL,              TRUE,  TRUE,   10),
  ('rooms', 'district',    'District',    'enum',    'district',        TRUE,  FALSE,  20),
  ('rooms', 'school_type', 'School Type', 'enum',    'school_type',     TRUE,  FALSE,  30),
  ('rooms', 'room_name',   'Room',        'text',    NULL,              TRUE,  TRUE,   40),
  ('rooms', 'building',    'Building',    'text',    NULL,              TRUE,  TRUE,   50),
  -- Free TEXT, not an enum: room_type is an open code list the schools extend.
  ('rooms', 'room_type',   'Type',        'text',    NULL,              TRUE,  TRUE,   60),
  ('rooms', 'condition',   'Condition',   'enum',    'room_condition',  TRUE,  TRUE,   70),
  ('rooms', 'capacity',    'Capacity',    'number',  NULL,              TRUE,  TRUE,   80),
  ('rooms', 'dimension',   'Dimension',   'text',    NULL,              TRUE,  FALSE,  90),
  ('rooms', 'description', 'Description', 'text',    NULL,              TRUE,  FALSE, 100),
  ('rooms', 'is_active',   'Active',      'boolean', NULL,              TRUE,  FALSE, 110),
  ('rooms', 'date_added',  'Date Added',  'date',    NULL,              TRUE,  FALSE, 120)
ON CONFLICT (dataset_key, field_key) DO UPDATE SET
  label            = EXCLUDED.label,
  data_type        = EXCLUDED.data_type,
  enum_source      = EXCLUDED.enum_source,
  filterable       = EXCLUDED.filterable,
  default_selected = EXCLUDED.default_selected,
  sort_order       = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- 4. Self-test — 166's, re-run over every dataset including the two new ones.
--    Fails at APPLY time rather than the first time a user presses Run.
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
