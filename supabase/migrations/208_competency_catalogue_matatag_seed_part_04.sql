-- ============================================================================
-- 208: Seed the competency catalogue from the MATATAG learning competencies
-- Part 4 of 22: Grade 3
-- ============================================================================
-- Source: Learning_Competencies_Split.xlsx (Kindergarten to Grade 12, one row
-- per competency). Columns taken: Grade Level, Subject, Term, Week,
-- Domain / Subdomain / Content, Learning Competency. Requires 207.
--
--   6718 entries across 110 learning areas (10 exact duplicate rows in
--   the sheet dropped).
--
-- Mapping
--   Subject      -> sms_learning_areas.name, created if missing (matched on
--                   lower(btrim(name)), the unique index from 195). Spacing
--                   before a colon and en/em dashes are normalised so
--                   "EPP : AFA" and "EPP: AFA" are one area.
--   Grade Level  -> grade_level (Kindergarten = 0).
--   Term         -> term 1 / 2 / 3; a blank term is NULL.
--   Week, Domain -> verbatim, whitespace collapsed.
--   Competency   -> competency_text, whitespace collapsed (195's trigger
--                   would do the same).
--
-- LC codes: the sheet carries none, and lc_code is NOT NULL and the import
-- key (195). Each entry gets a sequential code per (learning area, grade) in
-- sheet order: K-001, G5-001, G5-002 ... so the catalogue lists in curriculum
-- order. Replace a code with the official one later through the catalogue's
-- typo edit; a TOS already saved keeps the code it copied.
--
-- Split into parts because the Supabase SQL editor refuses a query this
-- large. Each part is self-contained and may run in any order; run them all.
-- Idempotent: ON CONFLICT DO NOTHING on both tables, so re-running a part
-- inserts nothing and never overwrites an entry edited since. No UPDATE, no DELETE.
-- Ends with a verification SELECT (the SQL editor shows only the last result).
-- ============================================================================

INSERT INTO procurements.sms_learning_areas (name)
VALUES
  ('Science')
ON CONFLICT ((lower(btrim(name)))) DO NOTHING;

/* Grade 3: 23 */
INSERT INTO procurements.sms_competency_catalogue
  (learning_area_id, grade_level, lc_code, competency_text, term, week, domain)
SELECT a.id, v.grade_level::int, v.lc_code::text, v.competency_text::text, v.term::smallint, v.week::text, v.domain::text
FROM (VALUES
  ('Science', 3, 'G3-012', 'Describe the characteristics of living things: they grow, respond, and reproduce.', 2, '1 to 2', NULL),
  ('Science', 3, 'G3-013', 'Observe and describe the outer body parts of animals, such as head, legs or wings, and identify their role to move and to gather food.', 2, '3 to 4', NULL),
  ('Science', 3, 'G3-014', 'Observe the outer parts of plants, such as leaves, roots, and stems and identify their role to get water and nutrients from the soil.', 2, '3 to 4', NULL),
  ('Science', 3, 'G3-015', 'Identify the basic needs of all living things, such as air, food, water, and shelter.', 2, '5 to 7', NULL),
  ('Science', 3, 'G3-016', 'Observe examples and explain how living things depend on one another and on the environment to meet their basic needs.', 2, '5 to 7', NULL),
  ('Science', 3, 'G3-017', 'Recognize that there is a need to protect and conserve the environment for living things to survive.', 2, '5 to 7', NULL),
  ('Science', 3, 'G3-018', 'Explore and demonstrate different ways to make objects move by natural causes, such as wind and water, or by people, such as pushing, pulling, rolling, and carrying.', 2, '8 to 10', NULL),
  ('Science', 3, 'G3-019', 'Explore and describe things that affect the movement of objects, including size, shape, heaviness, material, and surface texture.', 2, '8 to 10', NULL),
  ('Science', 3, 'G3-020', 'Measure and describe changes in the position of people or objects in relation to their original position, such as moving closer, farther, left, or right.', 2, '11', NULL),
  ('Science', 3, 'G3-021', 'Explore and describe how sound is made and transferred in everyday situations, such as the ringing of a bell or the hearing of noises.', 3, '1 to 5', NULL),
  ('Science', 3, 'G3-022', 'Describe sources of light and their use in everyday situations.', 3, '1 to 5', NULL),
  ('Science', 3, 'G3-023', 'Participate in guided science activities to explore and describe sources of light, how it behaves or can be changed, and its uses in everyday situations.', 3, '1 to 5', NULL),
  ('Science', 3, 'G3-024', 'Explain how light and sound can be harmful to people and make suggestions on how to protect oneself from them.', 3, '1 to 5', NULL),
  ('Science', 3, 'G3-025', 'Participate in guided activities to explore and describe some ways to use movement, sound, and light to send information between two people.', 3, '1 to 5', NULL),
  ('Science', 3, 'G3-026', 'Participate in guided activities to locate and describe different types of non-living things found in and around their school, such as rocks, soil, water, air, metals, clouds, rain, and sunlight.', 3, '6', NULL),
  ('Science', 3, 'G3-027', 'Identify some useful things that people have made from non-living materials and describe what natural materials have been used to make the items.', 3, '7', NULL),
  ('Science', 3, 'G3-028', 'Recognize that the non-living materials that make up the environment are referred to as ‘earth materials.', 3, '7', NULL),
  ('Science', 3, 'G3-029', 'Observe and record changes in the weather during a day or over some days and describe the different types and patterns of weather that occur in the local area.', 3, '8 to 11', NULL),
  ('Science', 3, 'G3-030', 'Describe how changes in the weather can affect daily activities and explain how some types of weather can be dangerous for people.', 3, '8 to 11', NULL),
  ('Science', 3, 'G3-031', 'Participate in guided activities to carefully observe and describe the natural objects commonly seen in the sky during daytime and nighttime, including the Sun, the Moon, planets, and stars;', 3, '8 to 11', NULL),
  ('Science', 3, 'G3-032', 'Participate in guided activities to explore and record how and when the Sun, the Moon, planets, and stars can be seen moving across the sky.', 3, '8 to 11', NULL),
  ('Science', 3, 'G3-033', 'Explain how natural objects in the sky affect activities of people.', 3, '8 to 11', NULL),
  ('Science', 3, 'G3-034', 'Describe safety measures that people can use to avoid the harmful effects of the Sun’s light.', 3, '8 to 11', NULL)
) AS v(area, grade_level, lc_code, competency_text, term, week, domain)
JOIN procurements.sms_learning_areas a ON lower(btrim(a.name)) = lower(btrim(v.area))
ON CONFLICT (learning_area_id, grade_level, lc_code) DO NOTHING;

/* Verification: after all 22 parts, seeded_entries = 6718. */
SELECT count(*) AS seeded_entries,
       count(DISTINCT learning_area_id) AS learning_areas
FROM procurements.sms_competency_catalogue
WHERE lc_code ~ '^(K|G[0-9]+)-[0-9]{3}$';
