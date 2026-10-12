-- 205: Grade 1 PACE — macro-skill rating squares, GMRC performance standards,
--      term dates for the card's attendance record
--
-- The UPDATED "[Grade 1] ECR, PACE Form, and SF9" workbook (2026_v1.0) changes
-- three things 180 modelled on the earlier issue.
--
-- (a) Reading and Literacy and Language are rated PER MACRO SKILL. Each
--     competency now prints two to four coloured squares per term, one per
--     language macro skill — Listening (yellow), Speaking (purple), Reading
--     (orange), Copying and Guided Writing in response to Comprehension
--     Questions (green) — and the form says "write the learner's rating
--     directly on the colored square for each term". A grey square is not
--     rated that term. 180 stored one rating per (competency, term), which
--     cannot hold "Listening B, Speaking C".
--
--       * `sms_pace_competencies.macro_skills` — the squares, as
--         [{"skill": "listening", "terms": [1,2,3]}, ...] in printed order.
--         EMPTY = rated as a whole, as before (Mathematics, GMRC, Makabansa).
--         JSONB rather than a child table because it is read with the
--         competency on every screen and never queried on its own; the skill
--         codes are app-validated in lib/constants/pace.ts per 119/132.
--         `terms` stays the union of the squares' terms — every reader that
--         asks "is this competency rated in Term 2" keeps working.
--       * `sms_pace_ratings.macro_skill` — NULL for a whole-competency rating,
--         else the square. The unique key gains the column with NULLS NOT
--         DISTINCT (production is PG 15.14), so a whole-competency rating is
--         still one row and the client upserts name the column explicitly.
--
--     Extracted from the cell fills of the workbook's PACE sheet, not typed:
--     88 competencies, and for every one of them the union of its squares'
--     terms equals the `terms` 180 seeded — the update adds squares, it does
--     not move a competency to another term.
--
--     ⚠ Ratings already entered for a Reading/Language competency (macro_skill
--     NULL) are carried into the squares: the existing row takes the first
--     square of that term and a copy is inserted for each other square of
--     that term. No rating is deleted or changed in value; the adviser
--     refines per skill afterwards. Count them before applying:
--
--       SELECT a.code, count(*)
--       FROM procurements.sms_pace_ratings r
--       JOIN procurements.sms_pace_competencies c ON c.id = r.competency_id
--       JOIN procurements.sms_pace_areas a ON a.id = c.area_id
--       WHERE a.code IN ('RL', 'LANG') GROUP BY a.code;
--
-- (b) GMRC prints a "Performance Standard" column beside each value.
--     `performance_standard` TEXT, transcribed verbatim per 137/154/172 —
--     including Term 3 #3 (Mapagmalasakit), whose standard the issued sheet
--     prints as a copy of #4's "pagiging mapagbigay" line.
--
-- (c) The card's attendance record splits September across Terms 1 and 2
--     (twelve rows), because the term boundary falls inside the month. 180
--     printed it once under Term 1 because nothing recorded where a term
--     starts. `sms_school_term_dates` records the start of Terms 2 and 3 per
--     school year; NULL `school_id` = division-wide, per 106/118/125, with a
--     school's own row taking precedence. RLS is 125's shape verbatim. With
--     no row, the card prints exactly as before.
--
-- Also retires the two 'LEGEND' rows 180 seeded as strand headings (RL-049,
-- LANG-070): the word is the caption of the colour key under the list, and
-- printed as a heading it ruled off an empty strand. Retired, not deleted.
--
-- And un-rates three group parents 180 seeded with a rating cell, which the
-- workbook leaves without one because their lettered sub-items carry the
-- ratings: Mathematics T1 "9. Illustrate by applying the following
-- properties…:" (MATH-010), T2 "3. Determine:" (MATH-024) and Makabansa T1
-- "1. Nailalarawan na ang bawat tao ay may iba't-ibang:" (MKB-001). Their
-- `terms` become empty, as every other parent's. A rating already given on
-- one is kept in the table but no longer shown or printed; count them first:
--
--   SELECT c.code, count(*) FROM procurements.sms_pace_ratings r
--   JOIN procurements.sms_pace_competencies c ON c.id = r.competency_id
--   WHERE c.code IN ('MATH-010', 'MATH-024', 'MKB-001') GROUP BY c.code;
--
-- Additive: two columns on competencies, one on ratings, one new table. The
-- only DML is on the reference rows (88 macro_skills, 24 standards, 2
-- retirements, 3 parents un-rated — each guarded so a re-run never
-- overwrites a later edit) and the carry-forward in (a).

SET search_path TO procurements, public;

BEGIN;

-- ---------------------------------------------------------------------------
-- (a) macro-skill squares
-- ---------------------------------------------------------------------------

ALTER TABLE procurements.sms_pace_competencies
  ADD COLUMN IF NOT EXISTS macro_skills JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE procurements.sms_pace_competencies
  DROP CONSTRAINT IF EXISTS sms_pace_competencies_macro_skills_array;
ALTER TABLE procurements.sms_pace_competencies
  ADD CONSTRAINT sms_pace_competencies_macro_skills_array
  CHECK (jsonb_typeof(macro_skills) = 'array');

COMMENT ON COLUMN procurements.sms_pace_competencies.macro_skills IS
  'Reading/Language: one coloured rating square per macro skill, [{"skill":"listening","terms":[1,2,3]}, ...] in printed order. Empty = rated as a whole. `terms` is the union of the squares'' terms.';

UPDATE procurements.sms_pace_competencies c
SET macro_skills = v.skills
FROM (VALUES
    ('RL-002', '[{"skill":"listening","terms":[1]},{"skill":"speaking","terms":[1]}]'::jsonb),
    ('RL-003', '[{"skill":"listening","terms":[1]},{"skill":"speaking","terms":[1]}]'::jsonb),
    ('RL-004', '[{"skill":"listening","terms":[1]},{"skill":"speaking","terms":[1]}]'::jsonb),
    ('RL-005', '[{"skill":"listening","terms":[1]},{"skill":"speaking","terms":[1]}]'::jsonb),
    ('RL-006', '[{"skill":"listening","terms":[1]},{"skill":"speaking","terms":[1]}]'::jsonb),
    ('RL-008', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-009', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-010', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-011', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-012', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-014', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-016', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]},{"skill":"writing","terms":[2,3]}]'::jsonb),
    ('RL-017', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]},{"skill":"writing","terms":[2,3]}]'::jsonb),
    ('RL-018', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-019', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-020', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]},{"skill":"writing","terms":[1,2,3]}]'::jsonb),
    ('RL-022', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-023', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-024', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[1,2,3]}]'::jsonb),
    ('RL-026', '[{"skill":"listening","terms":[3]},{"skill":"speaking","terms":[3]},{"skill":"reading","terms":[3]}]'::jsonb),
    ('RL-028', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[2,3]}]'::jsonb),
    ('RL-029', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[2,3]}]'::jsonb),
    ('RL-030', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[2,3]}]'::jsonb),
    ('RL-031', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[2,3]}]'::jsonb),
    ('RL-032', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[2,3]}]'::jsonb),
    ('RL-033', '[{"skill":"listening","terms":[2,3]},{"skill":"speaking","terms":[2,3]},{"skill":"reading","terms":[2,3]}]'::jsonb),
    ('RL-034', '[{"skill":"listening","terms":[3]},{"skill":"speaking","terms":[3]},{"skill":"reading","terms":[3]}]'::jsonb),
    ('RL-036', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[2,3]}]'::jsonb),
    ('RL-037', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]},{"skill":"reading","terms":[2,3]}]'::jsonb),
    ('RL-040', '[{"skill":"speaking","terms":[1,2,3]},{"skill":"writing","terms":[1,2,3]}]'::jsonb),
    ('RL-041', '[{"skill":"speaking","terms":[1,2,3]},{"skill":"writing","terms":[1,2,3]}]'::jsonb),
    ('RL-042', '[{"skill":"speaking","terms":[1,2,3]},{"skill":"writing","terms":[1,2,3]}]'::jsonb),
    ('RL-043', '[{"skill":"speaking","terms":[1,2,3]},{"skill":"writing","terms":[1,2,3]}]'::jsonb),
    ('RL-045', '[{"skill":"speaking","terms":[1,2,3]},{"skill":"writing","terms":[1,2,3]}]'::jsonb),
    ('RL-046', '[{"skill":"speaking","terms":[1,2,3]},{"skill":"writing","terms":[1,2,3]}]'::jsonb),
    ('RL-047', '[{"skill":"speaking","terms":[1,2,3]},{"skill":"writing","terms":[1,2,3]}]'::jsonb),
    ('RL-048', '[{"skill":"speaking","terms":[1,2,3]},{"skill":"writing","terms":[1,2,3]}]'::jsonb),
    ('LANG-003', '[{"skill":"listening","terms":[1,2]},{"skill":"speaking","terms":[1,2]}]'::jsonb),
    ('LANG-004', '[{"skill":"listening","terms":[3]},{"skill":"speaking","terms":[3]}]'::jsonb),
    ('LANG-005', '[{"skill":"listening","terms":[3]},{"skill":"speaking","terms":[3]}]'::jsonb),
    ('LANG-007', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-008', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-010', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-011', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-012', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-013', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-014', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-015', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-017', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-018', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-019', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-020', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-023', '[{"skill":"listening","terms":[1,2]},{"skill":"speaking","terms":[1,2]}]'::jsonb),
    ('LANG-024', '[{"skill":"listening","terms":[3]},{"skill":"speaking","terms":[3]}]'::jsonb),
    ('LANG-025', '[{"skill":"listening","terms":[3]},{"skill":"speaking","terms":[3]}]'::jsonb),
    ('LANG-027', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-028', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-029', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-031', '[{"skill":"listening","terms":[1,2]},{"skill":"speaking","terms":[1,2]}]'::jsonb),
    ('LANG-032', '[{"skill":"listening","terms":[3]},{"skill":"speaking","terms":[3]}]'::jsonb),
    ('LANG-033', '[{"skill":"listening","terms":[3]},{"skill":"speaking","terms":[3]}]'::jsonb),
    ('LANG-035', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-036', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-037', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-038', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-040', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-042', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-043', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-045', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-046', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-047', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-048', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-050', '[{"skill":"listening","terms":[1,2,3]}]'::jsonb),
    ('LANG-051', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-053', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-054', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-055', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-056', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-057', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-060', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-061', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-062', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-063', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-065', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-066', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-067', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-068', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb),
    ('LANG-069', '[{"skill":"listening","terms":[1,2,3]},{"skill":"speaking","terms":[1,2,3]}]'::jsonb)
) AS v(code, skills)
WHERE c.code = v.code
  AND c.macro_skills = '[]'::jsonb;

ALTER TABLE procurements.sms_pace_ratings
  ADD COLUMN IF NOT EXISTS macro_skill TEXT;

ALTER TABLE procurements.sms_pace_ratings
  DROP CONSTRAINT IF EXISTS sms_pace_ratings_macro_skill_check;
ALTER TABLE procurements.sms_pace_ratings
  ADD CONSTRAINT sms_pace_ratings_macro_skill_check
  CHECK (macro_skill IS NULL OR macro_skill IN ('listening', 'speaking', 'reading', 'writing'));

COMMENT ON COLUMN procurements.sms_pace_ratings.macro_skill IS
  'The macro-skill square this rating is written on (Reading/Language). NULL = the competency rated as a whole.';

ALTER TABLE procurements.sms_pace_ratings
  DROP CONSTRAINT IF EXISTS sms_pace_ratings_uniq;
ALTER TABLE procurements.sms_pace_ratings
  ADD CONSTRAINT sms_pace_ratings_uniq
  UNIQUE NULLS NOT DISTINCT (student_id, competency_id, section_id, school_year, term, macro_skill);

-- Carry existing whole-competency ratings into the squares of their term.
-- Copies first (every square but the first), then the original row takes the
-- first square, so the original keeps its id, assessor and timestamps.
WITH legacy AS (
  SELECT r.*, c.macro_skills
  FROM procurements.sms_pace_ratings r
  JOIN procurements.sms_pace_competencies c ON c.id = r.competency_id
  WHERE r.macro_skill IS NULL
    AND c.macro_skills <> '[]'::jsonb
),
squares AS (
  SELECT l.id AS rating_id, s.value->>'skill' AS skill, s.ordinality AS pos
  FROM legacy l,
    jsonb_array_elements(l.macro_skills) WITH ORDINALITY AS s(value, ordinality)
  WHERE (s.value->'terms') @> to_jsonb(l.term::int)
),
ranked AS (
  SELECT rating_id, skill, row_number() OVER (PARTITION BY rating_id ORDER BY pos) AS n
  FROM squares
)
INSERT INTO procurements.sms_pace_ratings
  (student_id, competency_id, section_id, school_id, school_year, term, rating,
   assessed_by, macro_skill, created_at, updated_at)
SELECT l.student_id, l.competency_id, l.section_id, l.school_id, l.school_year, l.term,
       l.rating, l.assessed_by, rk.skill, l.created_at, l.updated_at
FROM ranked rk
JOIN legacy l ON l.id = rk.rating_id
WHERE rk.n > 1
ON CONFLICT ON CONSTRAINT sms_pace_ratings_uniq DO NOTHING;

UPDATE procurements.sms_pace_ratings r
SET macro_skill = first_square.skill
FROM (
  SELECT DISTINCT ON (r2.id) r2.id, s.value->>'skill' AS skill
  FROM procurements.sms_pace_ratings r2
  JOIN procurements.sms_pace_competencies c ON c.id = r2.competency_id,
    jsonb_array_elements(c.macro_skills) WITH ORDINALITY AS s(value, ordinality)
  WHERE r2.macro_skill IS NULL
    AND c.macro_skills <> '[]'::jsonb
    AND (s.value->'terms') @> to_jsonb(r2.term::int)
  ORDER BY r2.id, s.ordinality
) AS first_square
WHERE r.id = first_square.id;

-- ---------------------------------------------------------------------------
-- (b) GMRC performance standards
-- ---------------------------------------------------------------------------

ALTER TABLE procurements.sms_pace_competencies
  ADD COLUMN IF NOT EXISTS performance_standard TEXT;

COMMENT ON COLUMN procurements.sms_pace_competencies.performance_standard IS
  'The "Performance Standard" column GMRC prints beside each value, verbatim. NULL elsewhere.';

UPDATE procurements.sms_pace_competencies c
SET performance_standard = v.standard
FROM (VALUES
    ('GMRC-002', 'Naipakikita ang tiwala sa sarili sa pamamagitan ng paggamit ng mga batayang impormasyon sa mga angkop na sitwasyon.'),
    ('GMRC-003', 'Naipapakita ang pagiging totoo sa pamamagitan ng mabuting pakikipag-ugnayan sa kapwa.'),
    ('GMRC-004', 'Naipakikita ang pagiging matiyaga sa pamamagitan ng palagiang pagtatabi ng mga naipong pera sa alkansiya o mga gamit sa lagayan'),
    ('GMRC-005', 'Naipakikita ang pagiging madasalin sa pamamagitan ng wastong kilos at salita sa pananalangin'),
    ('GMRC-006', 'Naipakikita ang pagiging mapagpasalamat sa pamamagitan ng pag-iingat ng mga yamang mula sa kapaligiran'),
    ('GMRC-007', 'Naipakikita ang pagiging magalang sa pamamagitan ng mga angkop na kilos na nagbibigay-halaga sa mga karapatang tinatamasa bilang bata'),
    ('GMRC-008', 'Naipakikita ang kalinisan sa pamamagitan ng palagiang pagsunod sa mga alituntunin sa paglilinis ng katawan ayon sa gabay ng pamilya, tagapangalaga, o nakatatanda'),
    ('GMRC-009', 'Naipakikita ang pagiging magalang sa pamamagitan ng wastong pagtugon sa mensahe ng kapwa'),
    ('GMRC-010', 'Naipakikita ang pagiging responsable sa pamamagitan ng pakikiisa sa mga munting gawain sa pamayanan ayon sa sariling kakayahan'),
    ('GMRC-011', 'Naipakikita ang pagiging matulungin sa pamamagitan ng pagtulong sa mga gawain ng pamilya sa tahanan ayon sa kakayahan'),
    ('GMRC-012', 'Naipakikita ang pagiging matulungin sa nakatatanda sa pamamagitan ng mga gawaing makatutulong at makapagbibigay-ginhawa sa kanila nang may pagsasaalang-alang sa ligtas na paraan'),
    ('GMRC-013', 'Nakapagsasanay sa pagiging madasalin sa pamamagitan ng pakikilahok sa pananalangin ng pamilya'),
    ('GMRC-014', 'Naipakikita ang kalinisan sa pamamamagitan ng pakikibahagi sa mga gawain ng pangangalaga sa kapaligiran'),
    ('GMRC-015', 'Naipakikita ang pagiging masunurin sa pamamagitan ng pagtalima sa mga mabuting gawi ng pamilyang Pilipino'),
    ('GMRC-016', 'Naipakikita ang tiwala sa sarili sa pamamagitan ng pagsasagawa ng mga gawain na nakabubuti sa sarili at sa kapwa bilang bahagi ng tagubilin ng pamilya'),
    ('GMRC-017', 'Naipakikita ang pagiging mapagbigay sa pamamagitan ng kusang-loob na pagbabahagi ng anumang mayroon siya'),
    ('GMRC-018', 'Naipakikita ang pagiging magalang sa pamamagitan ng pagtalima sa mga tagubilin at alituntunin ng pook- dalanginan'),
    ('GMRC-019', 'Naipakikita ang kalinisan sa pamamagitan ng palagiang pagpapaalala sa kapwa-bata ng wastong pagpapanatili ng kaayusan at kalinisan ng kapaligiran'),
    ('GMRC-020', 'Naipakikita ang pagiging mapagbigay sa pamamagitan ng kusang-loob na pagbabahagi ng anumang mayroon siya'),
    ('GMRC-021', 'Naipakikita ang pagiging mapagbigay sa pamamagitan ng kusang-loob na pagbabahagi ng anumang mayroon siya'),
    ('GMRC-022', 'Nakapagsasanay ng pagiging mabuting mamamayan sa pamamagitan ng kusang-loob na pagtulong sa pamilya sa mga gawaing pampamayanan'),
    ('GMRC-023', 'Nakapagsasanay sa pagiging magalang sa pamamagitan ng angkop na kilos sa iba’t ibang gawaing panrelihiyon o paniniwala sa pamayanan'),
    ('GMRC-024', 'Naipakikita ang pagiging mapagmalasakit sa pamamagitan ng panghihikayat sa kapwa na makiisa sa mga simpleng gawain ng pangangalaga ng kapaligiran'),
    ('GMRC-025', 'Naipakikita ang pagiging makabansa sa pamamagitan ng palagiang pagsunod sa mga panuntunan para sa mga sagisag ng bayan')
) AS v(code, standard)
WHERE c.code = v.code
  AND c.performance_standard IS NULL;

-- ---------------------------------------------------------------------------
-- 'LEGEND' was the caption of the colour key, not a strand
-- ---------------------------------------------------------------------------

UPDATE procurements.sms_pace_competencies
SET is_active = FALSE
WHERE code IN ('RL-049', 'LANG-070')
  AND description = 'LEGEND'
  AND is_heading;

-- ---------------------------------------------------------------------------
-- Group parents the workbook does not rate
-- ---------------------------------------------------------------------------

UPDATE procurements.sms_pace_competencies
SET terms = '{}'::SMALLINT[]
WHERE code IN ('MATH-010', 'MATH-024', 'MKB-001')
  AND cardinality(terms) > 0;

-- ---------------------------------------------------------------------------
-- (c) term dates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS procurements.sms_school_term_dates (
  id BIGSERIAL PRIMARY KEY,
  -- NULL = division-wide; a school's own row takes precedence.
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  term2_start DATE NOT NULL,
  term3_start DATE NOT NULL,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_school_term_dates_order CHECK (term3_start > term2_start)
);

COMMENT ON TABLE procurements.sms_school_term_dates IS
  'First day of Terms 2 and 3 per school year. NULL school_id = division-wide. Splits a month the term boundary falls inside (September on the Grade 1 card) into one attendance row per term.';

-- Two partial indexes rather than one UNIQUE: NULLs are distinct (163).
CREATE UNIQUE INDEX IF NOT EXISTS sms_school_term_dates_school_uniq
  ON procurements.sms_school_term_dates(school_id, school_year)
  WHERE school_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sms_school_term_dates_division_uniq
  ON procurements.sms_school_term_dates(school_year)
  WHERE school_id IS NULL;

DROP TRIGGER IF EXISTS update_sms_school_term_dates_updated_at ON procurements.sms_school_term_dates;
CREATE TRIGGER update_sms_school_term_dates_updated_at
  BEFORE UPDATE ON procurements.sms_school_term_dates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_school_term_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_term_dates_select" ON procurements.sms_school_term_dates;
CREATE POLICY "school_term_dates_select"
  ON procurements.sms_school_term_dates FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "school_term_dates_insert" ON procurements.sms_school_term_dates;
CREATE POLICY "school_term_dates_insert"
  ON procurements.sms_school_term_dates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND procurements.sms_school_term_dates.school_id IS NOT NULL
            AND u.school_id = procurements.sms_school_term_dates.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "school_term_dates_update" ON procurements.sms_school_term_dates;
CREATE POLICY "school_term_dates_update"
  ON procurements.sms_school_term_dates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND procurements.sms_school_term_dates.school_id IS NOT NULL
            AND u.school_id = procurements.sms_school_term_dates.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "school_term_dates_delete" ON procurements.sms_school_term_dates;
CREATE POLICY "school_term_dates_delete"
  ON procurements.sms_school_term_dates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND procurements.sms_school_term_dates.school_id IS NOT NULL
            AND u.school_id = procurements.sms_school_term_dates.school_id
          )
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_school_term_dates TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_school_term_dates_id_seq TO authenticated;

COMMIT;
