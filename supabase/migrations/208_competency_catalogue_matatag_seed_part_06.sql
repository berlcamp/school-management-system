-- ============================================================================
-- 208: Seed the competency catalogue from the MATATAG learning competencies
-- Part 6 of 22: Grade 4
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
  ('Mathematics'),
  ('Science')
ON CONFLICT ((lower(btrim(name)))) DO NOTHING;

/* Grade 4: 107 */
INSERT INTO procurements.sms_competency_catalogue
  (learning_area_id, grade_level, lc_code, competency_text, term, week, domain)
SELECT a.id, v.grade_level::int, v.lc_code::text, v.competency_text::text, v.term::smallint, v.week::text, v.domain::text
FROM (VALUES
  ('Mathematics', 4, 'G4-007', 'Find the perimeter of composite figures composed of triangles and quadrilaterals.', 1, '4', NULL),
  ('Mathematics', 4, 'G4-008', 'Read and write numbers up to 1 000 000 in numerals and in words.', 1, '5', NULL),
  ('Mathematics', 4, 'G4-009', 'Determine - the place value of a digit in a 6-digit number', 1, '5', NULL),
  ('Mathematics', 4, 'G4-010', 'Determine - the value of a digit', 1, '5', NULL),
  ('Mathematics', 4, 'G4-011', 'Determine - the digit of number, given its place value', 1, '5', NULL),
  ('Mathematics', 4, 'G4-012', 'Compare numbers up to 1 000 000 using =, < and >.', 1, '6', NULL),
  ('Mathematics', 4, 'G4-013', 'Round numbers to the nearest hundred thousand.', 1, '6', NULL),
  ('Mathematics', 4, 'G4-014', 'Estimate the sum and difference of two 5- to 6-digit numbers by rounding the addends to the nearest large place value of the numbers.', 1, '6', NULL),
  ('Mathematics', 4, 'G4-015', 'Add numbers with sums up to 1 000 000 and subtracts numbers where both numbers are less than', 1, '7 to 8', NULL),
  ('Mathematics', 4, 'G4-016', '1 000 000, with and without regrouping. - Multiply two numbers with and without regrouping - 3- to 4-digit numbers by a 1-digit number', 1, '7 to 8', NULL),
  ('Mathematics', 4, 'G4-017', '1 000 000, with and without regrouping. - Multiply two numbers with and without regrouping - 2- to 3-digit numbers by 2-digit numbers, with products up to 1 000 000."', 1, '7 to 8', NULL),
  ('Mathematics', 4, 'G4-018', '1 000 000, with and without regrouping. - Estimate the result of multiplying two numbers where the product is less than 1 000 000.', 1, '7 to 8', NULL),
  ('Mathematics', 4, 'G4-019', 'Solve multi-step problems involving one or more of the four operations with results of calculations up to 1 000 000, including problems involving money.', 1, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-020', 'Divide two numbers with and without regrouping - 3- to 4-digit numbers by 1-digit numbers', 1, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-021', 'Divide two numbers with and without regrouping - 2- to 3-digit numbers by 2-digit numbers"', 1, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-022', 'Estimate the quotient when dividing 3- to 4-digit dividends by 1- to 2-digit divisors, by first estimating the dividends and divisors using multiples of 10.', 1, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-023', 'Represent situations involving one or more of the four operations using a number sentence.', 2, '1 to 2', NULL),
  ('Mathematics', 4, 'G4-024', 'Perform two or more different operations by applying the MDAS rules.', 2, '1 to 2', NULL),
  ('Mathematics', 4, 'G4-025', 'Convert common units of measure from larger to smaller units, and vice versa - meter and centimeter', 2, '3', NULL),
  ('Mathematics', 4, 'G4-026', 'Convert common units of measure from larger to smaller units, and vice versa - kilometer and meter', 2, '3', NULL),
  ('Mathematics', 4, 'G4-027', 'Convert common units of measure from larger to smaller units, and vice versa - kilogram and gram', 2, '3', NULL),
  ('Mathematics', 4, 'G4-028', 'Convert common units of measure from larger to smaller units, and vice versa - gram and milligram', 2, '3', NULL),
  ('Mathematics', 4, 'G4-029', 'Convert common units of measure from larger to smaller units, and vice versa - liter and milliliter', 2, '3', NULL),
  ('Mathematics', 4, 'G4-030', 'Convert time measures from smaller to larger units, and vice versa - seconds to minutes', 2, '3', NULL),
  ('Mathematics', 4, 'G4-031', 'Convert time measures from smaller to larger units, and vice versa - minutes to hours', 2, '3', NULL),
  ('Mathematics', 4, 'G4-032', 'Convert time measures from smaller to larger units, and vice versa - hours to days', 2, '3', NULL),
  ('Mathematics', 4, 'G4-033', 'Convert time measures from smaller to larger units, and vice versa - days to weeks', 2, '3', NULL),
  ('Mathematics', 4, 'G4-034', 'Convert time measures from smaller to larger units, and vice versa - weeks to months', 2, '3', NULL),
  ('Mathematics', 4, 'G4-035', 'Convert time measures from smaller to larger units, and vice versa - months to years', 2, '3', NULL),
  ('Mathematics', 4, 'G4-036', 'Solve problems involving conversion of units of length, mass, capacity, and time, including problems involving elapsed time in hours and minutes.', 2, '4', NULL),
  ('Mathematics', 4, 'G4-037', 'Identify proper fractions, improper fractions, and mixed numbers.', 2, '5', NULL),
  ('Mathematics', 4, 'G4-038', 'Rewrite improper fractions into mixed numbers, and vice versa.', 2, '5', NULL),
  ('Mathematics', 4, 'G4-039', 'Plot fraction (proper fractions, improper fractions, and mixed numbers) with denominators 2, 4, 5, and 10 on the number line.', 2, '5', NULL),
  ('Mathematics', 4, 'G4-040', 'Add and subtract similar fractions - two proper fractions', 2, '6', NULL),
  ('Mathematics', 4, 'G4-041', 'Add and subtract similar fractions - two mixed numbers', 2, '6', NULL),
  ('Mathematics', 4, 'G4-042', 'Add and subtract similar fractions - a mixed number and a proper fraction', 2, '6', NULL),
  ('Mathematics', 4, 'G4-043', 'Add and subtract similar fractions - a whole number and a proper fraction', 2, '6', NULL),
  ('Mathematics', 4, 'G4-044', 'Add and subtract similar fractions - a whole number and a mixed number', 2, '6', NULL),
  ('Mathematics', 4, 'G4-045', 'Represent dissimilar fractions, with denominators up to 10, using models.', 2, '7', NULL),
  ('Mathematics', 4, 'G4-046', 'Compare dissimilar fractions using the symbols =, >, and <.', 2, '7', NULL),
  ('Mathematics', 4, 'G4-047', 'Order dissimilar fractions from smallest to largest, and vice versa.', 2, '8', NULL),
  ('Mathematics', 4, 'G4-048', 'Generate equivalent fractions using models.', 2, '8', NULL),
  ('Mathematics', 4, 'G4-049', 'Determine equivalent fractions.', 2, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-050', 'Identify the multiples of given numbers up to 100.', 2, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-051', 'Find all the factors of a given number up to 100.', 2, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-052', 'Reduce fractions to simplest form.', 2, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-053', 'Add and subtract dissimilar fractions using models.', 3, '1', NULL),
  ('Mathematics', 4, 'G4-054', 'Add and subtract dissimilar fractions - two proper fractions', 3, '2', NULL),
  ('Mathematics', 4, 'G4-055', 'Add and subtract dissimilar fractions - two mixed numbers', 3, '2', NULL),
  ('Mathematics', 4, 'G4-056', 'Add and subtract dissimilar fractions - a mixed number and a proper fraction', 3, '2', NULL),
  ('Mathematics', 4, 'G4-057', 'Add and subtract dissimilar fractions - a whole number and a proper fraction', 3, '2', NULL),
  ('Mathematics', 4, 'G4-058', 'Add and subtract dissimilar fractions - a whole number and a mixed number', 3, '2', NULL),
  ('Mathematics', 4, 'G4-059', 'Solve multi-step problems involving addition and/or subtraction of fractions.', 3, '3', NULL),
  ('Mathematics', 4, 'G4-060', 'Identify symmetry with respect to a line.', 3, '4', NULL),
  ('Mathematics', 4, 'G4-061', 'Complete a figure that is symmetric with respect to a line.', 3, '4', NULL),
  ('Mathematics', 4, 'G4-062', 'Draws the image of an object after applying reflection with respect to a line, including glide reflection.', 3, '4', NULL),
  ('Mathematics', 4, 'G4-063', 'Collect data with time element using appropriate sources.', 3, '5', NULL),
  ('Mathematics', 4, 'G4-064', 'Present data in a tabular form, or in a single line graph.', 3, '5', NULL),
  ('Mathematics', 4, 'G4-065', 'Interpret data presented in a tabular form, or in a single line graph.', 3, '6', NULL),
  ('Mathematics', 4, 'G4-066', 'Solve problems using data for at most two variables in a tabular form, or in a single line graph.', 3, '6', NULL),
  ('Mathematics', 4, 'G4-067', 'Describe the rule used to generate a given simple pattern.', 3, '7 to 8', NULL),
  ('Mathematics', 4, 'G4-068', 'Complete a number sentence - to represent a property of operations (e.g., 4 + 3 = 3 + ) (commutative property of addition)', 3, '7 to 8', NULL),
  ('Mathematics', 4, 'G4-069', 'Complete a number sentence - to represent equivalent number facts (e.g., 4 + = 6 + 3)', 3, '7 to 8', NULL),
  ('Mathematics', 4, 'G4-070', 'Represent decimal numbers using models and manipulatives to show the relationship to fractions.', 3, '7 to 8', NULL),
  ('Mathematics', 4, 'G4-071', 'Read and write decimal numbers with decimal parts to hundredths.', 3, '7 to 8', NULL),
  ('Mathematics', 4, 'G4-072', 'Determine - the place value to hundredths of a digit in a given decimal number', 3, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-073', 'Determine - the value of a digit', 3, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-074', 'Determine - the digit of number, given its place value.', 3, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-075', 'Convert decimal numbers to fractions, and fractions with denominators 10 or 100 to decimals.', 3, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-076', 'Plot decimal numbers with tenth decimal part on the number line.', 3, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-077', 'Compare and order decimal numbers with decimal parts to hundredths.', 3, '9 to 10', NULL),
  ('Mathematics', 4, 'G4-078', 'Round decimal numbers to the nearest whole number and to the nearest tenth.', 3, '9 to 10', NULL),
  ('Science', 4, 'G4-001', 'Use information from secondary sources to identify a famous Filipino and/or foreign scientist and their invention/s.', 1, '1 to 2', NULL),
  ('Science', 4, 'G4-002', 'Use information from the home or the local community to identify a science invention and explain its impact on their everyday life.', 1, '1 to 2', NULL),
  ('Science', 4, 'G4-003', 'Describe the chemical properties of materials, such as they can be burnt, react with other materials, or are degradable or biodegradable.', 1, '3 to 5', NULL),
  ('Science', 4, 'G4-004', 'Describe changes in properties of materials when exposed to certain changes in temperature, such as changes when wood or coal are burned.', 1, '3 to 5', NULL),
  ('Science', 4, 'G4-005', 'Demonstrate ways to minimize harmful changes in materials, such as restriction of burning of waste materials, and care in handling reactive materials.', 1, '3 to 5', NULL),
  ('Science', 4, 'G4-006', 'Identify issues and concerns in the local community and how they could be addressed by science, such as the treatment of waste.', 1, '6 to 7', NULL),
  ('Science', 4, 'G4-007', 'Apply science process skills and attitudes in conducting a guided survey about environmental issues and concerns including grouping and classifying, communicating, and open mindedness.', 1, '6 to 7', NULL),
  ('Science', 4, 'G4-008', 'Describe in simple terms how the following human body systems work: muscular, skeletal, digestive, circulatory, and respiratory.', 1, '8 to 9', NULL),
  ('Science', 4, 'G4-009', 'Observe the root and shoot system in plants and describe why they are important.', 1, '8 to 9', NULL),
  ('Science', 4, 'G4-010', 'Use a drawing or diagram to classify some Philippine animals and plants, based on their habitat: some live on land (terrestrial), live in water (aquatic) or fly in the air (aerial).', 1, '10 to 11', NULL),
  ('Science', 4, 'G4-011', 'Make a list or draw up a table with examples of animals and plants in a particular habitat, such as a garden, rice field, seashore, and mangrove swamp.', 1, '10 to 11', NULL),
  ('Science', 4, 'G4-012', 'Use flow charts to compare the different stages in the life cycle of animals, such as a butterfly, frog, chicken, and human.', 2, '1', NULL),
  ('Science', 4, 'G4-013', 'Use information from secondary sources to group animals according to the food they eat. Some are - plant eaters (herbivores)', 2, '2', NULL),
  ('Science', 4, 'G4-014', 'Use information from secondary sources to group animals according to the food they eat. Some are - meat eaters (carnivores)', 2, '2', NULL),
  ('Science', 4, 'G4-015', 'Use information from secondary sources to group animals according to the food they eat. Some are - plant and meat-eaters (omnivores)', 2, '2', NULL),
  ('Science', 4, 'G4-016', 'Draw a simple food chain using living things from the Philippines and label them as herbivores, carnivores, and omnivores.', 2, '3', NULL),
  ('Science', 4, 'G4-017', 'Participate in guided activities to discover and predict how rigid and soft objects can be moved and/or changed in shape.', 2, '4 to 9', NULL),
  ('Science', 4, 'G4-018', 'Determine how forces can change the shape of objects such as when they are pushed, pulled, stretched, bent, twisted, or squeezed.', 2, '4 to 9', NULL),
  ('Science', 4, 'G4-019', 'Measure accurately the distance and time when things move using simple equipment.', 2, '4 to 9', NULL),
  ('Science', 4, 'G4-020', 'Identify how far an object moves in a given time is called speed.', 2, '4 to 9', NULL),
  ('Science', 4, 'G4-021', 'Construct and label simple graphs of different speeds including stationary and uniform speeds, both fast and slow.', 2, '4 to 9', NULL),
  ('Science', 4, 'G4-022', 'Participate in guided activities to demonstrate that pushes and pulls can be used to change the speed and direction of an object including making it go faster, turn it to a different direction, slow it down, and stop it.', 2, '4 to 9', NULL),
  ('Science', 4, 'G4-023', 'Carry out guided investigations to identify the properties of magnets, including how they affect other magnets and objects made of different materials.', 2, '10 to 11', NULL),
  ('Science', 4, 'G4-024', 'Identify examples of how objects can affect other objects even when they are not in contact with each other, such as magnets attracting other objects, light from the sun affecting our eyes, and skin, and loud noises hurting our ears.', 2, '10 to 11', NULL),
  ('Science', 4, 'G4-025', 'Identify that energy is something that can cause change including light, sound, and heat energy.', 3, '1 to 2', NULL),
  ('Science', 4, 'G4-026', 'Observe and identify sources and uses of light, sound, and heat energy at school, at home and in the local community.', 3, '1 to 2', NULL),
  ('Science', 4, 'G4-027', 'Participate in guided activities using simple equipment to compare different types of soil including sandy, clay, silt, and loam, including comparing the ability of the soils to hold water.', 3, '3 to 6', NULL),
  ('Science', 4, 'G4-028', 'Recognize that water is one of the basic needs of plants and animals.', 3, '3 to 6', NULL),
  ('Science', 4, 'G4-029', 'Participate in a guided investigation to identify the effect of different types of soil on the growth of plants.', 3, '3 to 6', NULL),
  ('Science', 4, 'G4-030', 'Identify some of the basic characteristics used to describe the weather, such as air temperature, air pressure, wind speed, wind direction, humidity, rain, and cloud cover.', 3, '6 to 9', NULL),
  ('Science', 4, 'G4-031', 'Use weather instruments to measure and record some of the characteristics of weather during a school day.', 3, '6 to 9', NULL),
  ('Science', 4, 'G4-032', 'Examine a local weather chart to make simple interpretations about the local weather and how it might change and describe and practice safety precautions to use during poor or extreme weather conditions.', 3, '6 to 9', NULL),
  ('Science', 4, 'G4-033', 'Describe some of the overall characteristics of the Sun, such as its composition, its size, and the main energy it radiates.', 3, '10 to 11', NULL),
  ('Science', 4, 'G4-034', 'Describe the changes in the direction and length of shadows from a shadow stick and use the information to infer why the Sun changes position during a day.', 3, '10 to 11', NULL),
  ('Science', 4, 'G4-035', 'Make suggestions about the importance of the Sun to living things for a group or class discussion and confirm and record ideas by referring to trustworthy secondary sources of information.', 3, '10 to 11', NULL)
) AS v(area, grade_level, lc_code, competency_text, term, week, domain)
JOIN procurements.sms_learning_areas a ON lower(btrim(a.name)) = lower(btrim(v.area))
ON CONFLICT (learning_area_id, grade_level, lc_code) DO NOTHING;

/* Verification: after all 22 parts, seeded_entries = 6718. */
SELECT count(*) AS seeded_entries,
       count(DISTINCT learning_area_id) AS learning_areas
FROM procurements.sms_competency_catalogue
WHERE lc_code ~ '^(K|G[0-9]+)-[0-9]{3}$';
