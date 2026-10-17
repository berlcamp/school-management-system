-- ============================================================================
-- 208: Seed the competency catalogue from the MATATAG learning competencies
-- Part 10 of 22: Grade 6
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
  ('Science'),
  ('TLE: AFA / FCS / IA'),
  ('TLE: ICT')
ON CONFLICT ((lower(btrim(name)))) DO NOTHING;

/* Grade 6: 71 */
INSERT INTO procurements.sms_competency_catalogue
  (learning_area_id, grade_level, lc_code, competency_text, term, week, domain)
SELECT a.id, v.grade_level::int, v.lc_code::text, v.competency_text::text, v.term::smallint, v.week::text, v.domain::text
FROM (VALUES
  ('Science', 6, 'G6-004', 'Describe useful everyday examples of uniform and non-uniform mixtures, such as solutions and suspensions.', 1, '4 to 6', NULL),
  ('Science', 6, 'G6-005', 'Describe air as a mixture of oxygen, carbon dioxide, nitrogen, and water vapor.', 1, '4 to 6', NULL),
  ('Science', 6, 'G6-006', 'Demonstrate various techniques in separating mixtures, such as decantation, winnowing, scooping, picking, evaporation, filtering, sieving, and using magnets.', 1, '4 to 6', NULL),
  ('Science', 6, 'G6-007', 'Explain the benefits of each mixture separation technique in preparing useful products.', 1, '4 to 6', NULL),
  ('Science', 6, 'G6-008', 'Apply the features of a fair test: a. change one factor, b. measure one factor, and c. keep all other factors the same.', 1, '7 to 8', NULL),
  ('Science', 6, 'G6-009', 'Recognize the features of a fair test and that scientific investigations also involve a) doing at least three trials, or use replication, and b) observing, measuring, and recording accurately.', 1, '7 to 8', NULL),
  ('Science', 6, 'G6-010', 'Identify from pictures and diagrams the parts of the circulatory system as heart, blood, and blood vessels, and describe how they work.', 1, '9', NULL),
  ('Science', 6, 'G6-011', 'Describe the different ways that plants reproduce, such as pollination, seed production, and plant propagation.', 1, '10', NULL),
  ('Science', 6, 'G6-012', 'Plan a simple scientific investigation that includes the features of a fair test, replication, and accurate measurement to determine which type of plant propagation, such as cutting, budding, layering, grafting, works best for garden plants.', 1, '10', NULL),
  ('Science', 6, 'G6-013', 'Describe the differences between animals with a backbone (vertebrates) and animals without backbones (invertebrates) by using common local examples of each group.', 1, '11', NULL),
  ('Science', 6, 'G6-014', 'Describe the roles of producers, consumers, scavengers, and decomposers in a food web.', 2, '1', NULL),
  ('Science', 6, 'G6-015', 'Use information from secondary sources to describe that living things interact with each other in the natural environment, such as through competition, or predation.', 2, '2', NULL),
  ('Science', 6, 'G6-016', 'Describe living things, such as animals and plants, as biotic factors and light, water, temperature, and soil type, as abiotic factors of an ecosystem.', 2, '3 to 4', NULL),
  ('Science', 6, 'G6-017', 'Explain how interaction between living things and interactions between living and non-living things may bring good or harm to the living things involved.', 2, '3 to 4', NULL),
  ('Science', 6, 'G6-018', 'Observe and describe examples and uses of simple machines found at home, at school, and in the community.', 2, '5 to 7', NULL),
  ('Science', 6, 'G6-019', 'Demonstrate through guided investigation the advantages and limitations of simple machines such as inclined planes, wedges, levers, and pulleys.', 2, '5 to 7', NULL),
  ('Science', 6, 'G6-020', 'Carry out fair tests to show how levers can be used to change the magnitude and direction of a force.', 2, '5 to 7', NULL),
  ('Science', 6, 'G6-021', 'Identify that waves carry energy from a source to a receiver.', 2, '8 to 10', NULL),
  ('Science', 6, 'G6-022', 'Carry out investigations with water waves in a ripple tank, a big tub of water or improvised ripple tank and observe and describe the features of the waves including their - shape, such as crests and troughs', 2, '8 to 10', NULL),
  ('Science', 6, 'G6-023', 'Carry out investigations with water waves in a ripple tank, a big tub of water or improvised ripple tank and observe and describe the features of the waves including their - size, such as width and height', 2, '8 to 10', NULL),
  ('Science', 6, 'G6-024', 'Carry out investigations with water waves in a ripple tank, a big tub of water or improvised ripple tank and observe and describe the features of the waves including their - patterns of movement, such as how they bend, or reflect off walls', 2, '8 to 10', NULL),
  ('Science', 6, 'G6-025', 'Research using secondary sources to identify how the properties of waves are described using scientific terms such as amplitude, frequency, wavelength, and velocity.', 2, '8 to 10', NULL),
  ('Science', 6, 'G6-026', 'Demonstrate using simple models how longitudinal waves and transverse waves carry energy.', 3, '1 to 2', NULL),
  ('Science', 6, 'G6-027', 'Describe and explain how sound changes when the source or the receiver are moving.', 3, '1 to 2', NULL),
  ('Science', 6, 'G6-028', 'Explain what volcanoes are and how they are formed.', 3, '3 to 8', NULL),
  ('Science', 6, 'G6-029', 'Use local information or other reliable sources to identify where the nearest active and inactive volcanoes are located and assess the risk of impacts from eruptions to their local community.', 3, '3 to 8', NULL),
  ('Science', 6, 'G6-030', 'Discuss the patterns of volcanic eruptions in the Philippines over the last 100 years with family and community members to assess and describe how predictable patterns of eruptions are.', 3, '3 to 8', NULL),
  ('Science', 6, 'G6-031', 'Identify and describe some of the materials formed during volcanic eruptions in the Philippines.', 3, '3 to 8', NULL),
  ('Science', 6, 'G6-032', 'Interpret PHIVOLCS Volcano Monitoring (Alert Levels) to demonstrate what to do before, during, and after a volcanic eruption.', 3, '3 to 8', NULL),
  ('Science', 6, 'G6-033', 'Describe the different seasons in the Philippines and suggest activities that are appropriate for each season.', 3, '9', NULL),
  ('Science', 6, 'G6-034', 'Demonstrate the rotation of the Earth on its axis using a globe to explain day and night.', 3, '10', NULL),
  ('Science', 6, 'G6-035', 'Make a Sun-Earth-Moon system model to demonstrate and explain the observable effects of predictable patterns and events including - changes in seasons', 3, '10', NULL),
  ('Science', 6, 'G6-036', 'Make a Sun-Earth-Moon system model to demonstrate and explain the observable effects of predictable patterns and events including - changes observed in the patterns of visible star over a year', 3, '10', NULL),
  ('Science', 6, 'G6-037', 'Make a Sun-Earth-Moon system model to demonstrate and explain the observable effects of predictable patterns and events including - solar and lunar eclipses', 3, '10', NULL),
  ('Science', 6, 'G6-038', 'Explain why ancient human cultures relied on constellations to indicate directions and verify seasons.', 3, '11', NULL),
  ('Science', 6, 'G6-039', 'Gather information from local indigenous community members or from reliable secondary sources to investigate ways that indigenous people of the Philippines represented and communicated understandings of - the predictability of solar and lunar eclipses', 3, '11', NULL),
  ('Science', 6, 'G6-040', 'Gather information from local indigenous community members or from reliable secondary sources to investigate ways that indigenous people of the Philippines represented and communicated understandings of - patterns /interpretations in the night sky and their use for tracking time', 3, '11', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-001', 'Discuss fishery arts and its branches/fields.', 1, '1', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-002', 'Discuss the importance and benefits in fish raising.', 1, '2 to 3', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-003', 'Identify the government agencies and non-government organizations that support fish raising and fisheries.', 1, '2 to 3', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-004', 'Discuss the successful fish raisers in the community and their characteristics.', 1, '2 to 3', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-005', 'Discuss the requirements for natural fish raising.', 1, '4', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-006', 'Discuss the anatomy of fish.', 1, '4', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-007', 'Discuss the diseases, causes, sign and symptoms, preventions, and control measures of fish diseases.', 1, '5', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-008', 'Perform the procedure for natural fish raising with safety precautions.', 1, '6 to 7', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-009', 'Perform harvesting fishes with safety precautions.', 1, '8 to 9', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-010', 'Perform selling of fishes with safety precautions.', 1, '10', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-011', 'Identify the different family resources.', 2, '1', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-012', 'Discuss needs and wants.', 2, '1', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-013', 'Prepare a simple family budget plan.', 2, '2 to 3', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-014', 'Create a meal plan.', 2, '2 to 3', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-015', 'Discuss kitchen waste disposal.', 2, '2 to 3', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-016', 'Familiarize themselves with basic home kitchen tools and equipment.', 2, '4', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-017', 'Demonstrate measuring techniques with safety precautions.', 2, '5', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-018', 'Demonstrate cutting techniques with safety precautions.', 2, '6', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-019', 'Perform the method/s of cooking in preparing a simple meal with safety precautions.', 2, '7 to 9', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-020', 'Perform food preservation with precautions.', 2, '7 to 9', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-021', 'Sell preserved products.', 2, '10', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-022', 'Perform wood/bamboo works with safety precautions.', 3, '1 to 2', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-023', 'Perform sheet metal works with safety precautions.', 3, '3 to 4', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-024', 'Perform basic electrical skills with safety precautions.', 3, '5 to 6', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-025', 'Create simple wood/bamboo, metal and/or electrical project with safety precaution.', 3, '7 to 9', NULL),
  ('TLE: AFA / FCS / IA', 6, 'G6-026', 'Sell product.', 3, '10', NULL),
  ('TLE: ICT', 6, 'G6-001', 'Information and Communications Technology Perform web conferencing in a safe and responsible manner.', 1, '1 to 3', NULL),
  ('TLE: ICT', 6, 'G6-002', 'Information and Communications Technology Use online forms builder in a safe and responsible manner.', 1, '4 to 6', NULL),
  ('TLE: ICT', 6, 'G6-003', 'Information and Communications Technology Perform uploading and sharing of files in cloud storage in a safe and responsible manner.', 1, '7 to 10', NULL),
  ('TLE: ICT', 6, 'G6-004', 'Information and Communications Technology Create word documents with watermark, page color, page borders, page numbers, and header and f', 2, '1 to 5', NULL),
  ('TLE: ICT', 6, 'G6-005', 'Information and Communications Technology Nakagagawa ng presentation document.', 2, '6 to 10', NULL),
  ('TLE: ICT', 6, 'G6-006', 'Information and Communications Technology Perform slide recording.', 3, '1 to 3', NULL),
  ('TLE: ICT', 6, 'G6-007', 'Information and Communications Technology Create spreadsheets with charts and data validation features.', 3, '4 to 6', NULL),
  ('TLE: ICT', 6, 'G6-008', 'Information and Communications Technology Use block codes to create animations/games/digital story.', 3, '7 to 10', NULL)
) AS v(area, grade_level, lc_code, competency_text, term, week, domain)
JOIN procurements.sms_learning_areas a ON lower(btrim(a.name)) = lower(btrim(v.area))
ON CONFLICT (learning_area_id, grade_level, lc_code) DO NOTHING;

/* Verification: after all 22 parts, seeded_entries = 6718. */
SELECT count(*) AS seeded_entries,
       count(DISTINCT learning_area_id) AS learning_areas
FROM procurements.sms_competency_catalogue
WHERE lc_code ~ '^(K|G[0-9]+)-[0-9]{3}$';
