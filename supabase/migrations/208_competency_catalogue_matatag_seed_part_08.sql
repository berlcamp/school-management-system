-- ============================================================================
-- 208: Seed the competency catalogue from the MATATAG learning competencies
-- Part 8 of 22: Grade 5
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
  ('GMRC'),
  ('MAPEH'),
  ('Mathematics'),
  ('Science')
ON CONFLICT ((lower(btrim(name)))) DO NOTHING;

/* Grade 5: 133 */
INSERT INTO procurements.sms_competency_catalogue
  (learning_area_id, grade_level, lc_code, competency_text, term, week, domain)
SELECT a.id, v.grade_level::int, v.lc_code::text, v.competency_text::text, v.term::smallint, v.week::text, v.domain::text
FROM (VALUES
  ('GMRC', 5, 'G5-079', 'Nakapagsasanay sa pagiging mapanagutan sa pamamagitan ng paglahok sa mga gawaing nanghihimok sa mga mamamayan na makibahagi sa pangangalaga ng kalikasan. - Nakatatalakay ng mga pagkilos na humihikayat sa pamayanan na pangalagaan ang kalikasan.', 3, '11 (5 days)', NULL),
  ('GMRC', 5, 'G5-080', 'Nakapagsasanay sa pagiging mapanagutan sa pamamagitan ng paglahok sa mga gawaing nanghihimok sa mga mamamayan na makibahagi sa pangangalaga ng kalikasan. - Napatutunayan na ang mga kilos na humihikayat sa pamayanan na pangalagaan ang kalikasan ay nagbibigay ng pagkakataon sa sama-samang pagkilos ng mga mamamayan upang matiyak ang pagpapanatili ng biyaya ng kalikasan para sa kasalukuyan at mga susunod na henerasyon.', 3, '11 (5 days)', NULL),
  ('GMRC', 5, 'G5-081', 'Nakapagsasanay sa pagiging mapanagutan sa pamamagitan ng paglahok sa mga gawaing nanghihimok sa mga mamamayan na makibahagi sa pangangalaga ng kalikasan. - Nailalapat ang mga kilos na humihikayat sa pamayanan na pangalagaan ang kalikasan.', 3, '11 (5 days)', NULL),
  ('GMRC', 5, 'G5-082', 'Nakapagsasanay sa nasyonalismo sa pamamagitan ng pagtangkilik sa mga disenyong Pilipino sa kaniyang pansariling kagamitan at pagpapalaganap nito. - Natutukoy ang mga likhang-sining sa kinabibilangang rehiyon.', 3, '12 to 13 (10 days)', NULL),
  ('GMRC', 5, 'G5-083', 'Nakapagsasanay sa nasyonalismo sa pamamagitan ng pagtangkilik sa mga disenyong Pilipino sa kaniyang pansariling kagamitan at pagpapalaganap nito. - Nabibigyang-diin na ang pagkilala sa mga likhang- sining sa kinabibilangang rehiyon ay bahagi ng mabuting gawi tungo sa pakikipagkapuwa at pagyakap sa kulturang Pilipino na dapat pagyamanin at palaganapin upang maisulong ang pambansang pagkakakilanlan.', 3, '12 to 13 (10 days)', NULL),
  ('GMRC', 5, 'G5-084', 'Nakapagsasanay sa nasyonalismo sa pamamagitan ng pagtangkilik sa mga disenyong Pilipino sa kaniyang pansariling kagamitan at pagpapalaganap nito. - Nakabubuo ng isang likhang-sining na nagtatampok ng kulturang Pilipino at ng kaniyang talento.', 3, '12 to 13 (10 days)', NULL),
  ('MAPEH', 5, 'G5-001', 'Discuss various Forms, Functions, Mediums, Patterns, and Practices of the early Philippine performing and visual arts in their locality/province/region.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-002', 'Categorize and apply mediums, patterns, symbolisms, and other relevant practices—such as rhythm, tempo, choice of motifs, materials, and mediums—found in their region during the early Philippine period in the creation of performing and visual arts.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-003', 'Assess sample works based on the personal meanings derived from the early Philippine performing and visual arts.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-004', 'Adapt the conventional processes and practices of early Philippine performing and visual arts in their creative works.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-005', 'Evaluate creative works based on identified conventions during the early Philippine performing and visual arts.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-006', 'Apply various healthy coping strategies to manage stress.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-007', 'Demonstrate assertive behaviour to prevent and deal with bullying, harassment, discrimination, and violence.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-008', 'Describe concepts, effects, and ways to manage changes during puberty.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-009', 'Analyze various family roles in managing changes during puberty.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-010', 'Perform physical activities using striking/fielding and or net/wall game concepts with agility, balance, and coordination for active living.', 1, '*', NULL),
  ('MAPEH', 5, 'G5-011', 'Differentiate the relevant changing styles, functions, and conventions in performing and visual arts processes and practices between the 16th – 17th Century.', 2, '*', NULL),
  ('MAPEH', 5, 'G5-012', 'Determine the styles, and functions of representative works based on the concepts, processes, and practices in performing and visual arts of the 16th – 17th Century.', 2, '*', NULL),
  ('MAPEH', 5, 'G5-013', 'Apply the mediums, patterns, forms, and relevant practices in performing and visual arts in the production of creative works inspired by their locality/province and regions during the 16th – 17th Century.', 2, '*', NULL),
  ('MAPEH', 5, 'G5-014', 'Examine their creative works based on accepted conventional processes and practices in performing and visual arts during the 16th – 17th Century.', 2, '*', NULL),
  ('MAPEH', 5, 'G5-015', 'Explain the proper use of medicines as health products to prevent misuse and harm to the body.', 2, '*', NULL),
  ('MAPEH', 5, 'G5-016', 'Analyze the negative effects of gateway drugs on the individual, family, and the community.', 2, '*', NULL),
  ('MAPEH', 5, 'G5-017', 'Determine the negative effects of medicine misuse and use of gateway drugs to physical activity and fitness.', 2, '*', NULL),
  ('MAPEH', 5, 'G5-018', 'Participate actively in different rhythmic activities and dances for maintaining their movement competence and physical activity participation.', 2, '*', NULL),
  ('MAPEH', 5, 'G5-019', 'Distinguish relevant concepts, processes, and practices applied in the different performing and visual arts during the 17th – 18th Century in their locality/ province/ region.', 3, '*', NULL),
  ('MAPEH', 5, 'G5-020', 'Discuss contemporary forms in performing and visual arts inspired by the conventions during 17th – 18th Century.', 3, '*', NULL),
  ('MAPEH', 5, 'G5-021', 'Evaluate creative works based on identified conventions during the 17th – 18th Century.', 3, '*', NULL),
  ('MAPEH', 5, 'G5-022', 'Adapt conventional processes and practice in performingandvisualartsduringthe17th–18th Century in their creative works.', 3, '*', NULL),
  ('MAPEH', 5, 'G5-023', 'Discuss potential hazards and safety guidelines at home, in school, in the community, and outdoors.', 3, '*', NULL),
  ('MAPEH', 5, 'G5-024', 'Demonstrate self-management skills for road safety.', 3, '*', NULL),
  ('MAPEH', 5, 'G5-025', 'Analyze ways to prevent injuries during physical activity participations.', 3, '*', NULL),
  ('MAPEH', 5, 'G5-026', 'Participate actively in different rhythmic activities and dances for maintaining their movement competence and physical activity participation.', 3, '*', NULL),
  ('Mathematics', 5, 'G5-001', 'Describe a 12- and 24-hour clock system.', 1, '1', NULL),
  ('Mathematics', 5, 'G5-002', 'Convert 12-hour time to 24-hour time, and vice-versa.', 1, '1', NULL),
  ('Mathematics', 5, 'G5-003', 'Solve problems involving 12- and 24-hour time.', 1, '1', NULL),
  ('Mathematics', 5, 'G5-004', 'Compare the time in different world time zones to the time in the Philippines using a world time zone map.', 1, '2', NULL),
  ('Mathematics', 5, 'G5-005', 'Solve problems on comparing the time in different world time zones to the time in the Philippines.', 1, '2', NULL),
  ('Mathematics', 5, 'G5-006', 'Perform three or more different operations by applying the GMDAS rules.', 1, '3 to 4', NULL),
  ('Mathematics', 5, 'G5-007', 'Multiply fractions using models.', 1, '3 to 4', NULL),
  ('Mathematics', 5, 'G5-008', 'Multiply a fraction by a fraction.', 1, '3 to 4', NULL),
  ('Mathematics', 5, 'G5-009', 'Solve multi-step problems involving multiplication of fractions that may or may not also involve addition or subtraction of fractions.', 1, '5', NULL),
  ('Mathematics', 5, 'G5-010', 'Identify the height of a parallelogram, triangle, and trapezoid, in different orientations.', 1, '6 to 7', NULL),
  ('Mathematics', 5, 'G5-011', 'Find the area of a parallelogram, triangle, and trapezoid, in sq. cm or sq. m, using formulas.', 1, '6 to 7', NULL),
  ('Mathematics', 5, 'G5-012', 'Estimate the areas of triangles and quadrilaterals (parallelogram, rhombus, trapezoid) using grids.', 1, '6 to 7', NULL),
  ('Mathematics', 5, 'G5-013', 'Divide fractions using models.', 1, '8', NULL),
  ('Mathematics', 5, 'G5-014', 'Divide a fraction by a fraction.', 1, '8', NULL),
  ('Mathematics', 5, 'G5-015', 'Solve multi-step problems involving division of fractions that may or may not involve the other operations with fractions.', 1, '9', NULL),
  ('Mathematics', 5, 'G5-016', 'Determine - The place value to thousandths of a digit in a given decimal number', 1, '10', NULL),
  ('Mathematics', 5, 'G5-017', 'Determine - The value of a digit', 1, '10', NULL),
  ('Mathematics', 5, 'G5-018', 'Determine - The digit of a number, given its place value', 1, '10', NULL),
  ('Mathematics', 5, 'G5-019', 'Read and write decimal numbers with decimal parts to thousandths.', 1, '10', NULL),
  ('Mathematics', 5, 'G5-020', 'Convert terminating decimals to fractions, and vice versa.', 2, '1', NULL),
  ('Mathematics', 5, 'G5-021', 'Compare and order decimal numbers with decimal parts to thousandths.', 2, '1', NULL),
  ('Mathematics', 5, 'G5-022', 'Round decimal numbers to the nearest thousandths.', 2, '2', NULL),
  ('Mathematics', 5, 'G5-023', 'Add and subtract decimal numbers with decimal parts of up to 3 decimal places.', 2, '2', NULL),
  ('Mathematics', 5, 'G5-024', 'Solve multi-step problems involving addition and/or subtraction of decimals, including problems involving money.', 2, '3', NULL),
  ('Mathematics', 5, 'G5-025', 'Use divisibility rules to find common factors of numbers - divisibility rules for 2, 5, and 10', 2, '4 to 5', NULL),
  ('Mathematics', 5, 'G5-026', 'Use divisibility rules to find common factors of numbers - divisibility rules for 3, 6, and 9', 2, '4 to 5', NULL),
  ('Mathematics', 5, 'G5-027', 'Use divisibility rules to find common factors of numbers - divisibility rules for 4, 8, 11, and 12', 2, '4 to 5', NULL),
  ('Mathematics', 5, 'G5-028', 'Distinguish prime numbers from composite numbers using the Sieve of Eratosthenes.', 2, '4 to 5', NULL),
  ('Mathematics', 5, 'G5-029', 'Collects bivariate data from interview, questionnaire, and other appropriate sources.', 2, '6', NULL),
  ('Mathematics', 5, 'G5-030', 'Identify the appropriate graph (bar graph or line graph) to represent a given set of data.', 2, '6', NULL),
  ('Mathematics', 5, 'G5-031', 'Construct double bar graphs and double line graphs.', 2, '7 to 8', NULL),
  ('Mathematics', 5, 'G5-032', 'Interpret data presented in a double bar graph or a double line graph.', 2, '7 to 8', NULL),
  ('Mathematics', 5, 'G5-033', 'Draw conclusions or make inferences based on data presented in a double bar graph or a double line graph.', 2, '7 to 8', NULL),
  ('Mathematics', 5, 'G5-034', 'Solve problems using data presented in a double bar graph or a double line graph.', 2, '9', NULL),
  ('Mathematics', 5, 'G5-035', 'Describe probability as a measure of the chance of an event occurring.', 2, '10', NULL),
  ('Mathematics', 5, 'G5-036', 'Calculate the theoretical probability of a simple event by listing all possible outcomes.', 2, '10', NULL),
  ('Mathematics', 5, 'G5-037', 'Estimate each of two decimal numbers to the nearest whole number to estimate their product.', 3, '1 to 2', NULL),
  ('Mathematics', 5, 'G5-038', 'Multiply decimal numbers with decimal parts of up to 2 decimal places.', 3, '1 to 2', NULL),
  ('Mathematics', 5, 'G5-039', 'Solve multi-step problems involving multiplication of decimals that may or may not also involve addition or subtraction of decimals, including problems involving money.', 3, '1 to 2', NULL),
  ('Mathematics', 5, 'G5-040', 'Estimate the quotient when dividing two decimal numbers by estimating the dividend and divisor to the nearest whole number.', 3, '3 to 4', NULL),
  ('Mathematics', 5, 'G5-041', 'Divide - 1- to 2-digit whole numbers resulting in a terminating decimal quotient (e.g., 4 ÷ 5 = 0.8)', 3, '3 to 4', NULL),
  ('Mathematics', 5, 'G5-042', 'Divide - a decimal of up to 2 decimal places by a 1- to 2-digit whole number, resulting in a terminating decimal quotient of up to 3 decimal places.', 3, '3 to 4', NULL),
  ('Mathematics', 5, 'G5-043', 'Solve multi-step problems involving division of decimals that may or may not also involve the other operations with decimals, including problems involving money.', 3, '3 to 4', NULL),
  ('Mathematics', 5, 'G5-044', 'Perform three or more different operations with fractions and decimals by applying the GMDAS rules.', 3, '5', NULL),
  ('Mathematics', 5, 'G5-045', 'Illustrate different solid figures using concrete and pictorial models.', 3, '6', NULL),
  ('Mathematics', 5, 'G5-046', 'Relate plane figures to solid figures using concrete and pictorial models.', 3, '6', NULL),
  ('Mathematics', 5, 'G5-047', 'Describe and differentiate prisms and pyramids using their vertices, faces, and/or edges.', 3, '7', NULL),
  ('Mathematics', 5, 'G5-048', 'Illustrate and describe solid figures and their nets.', 3, '7', NULL),
  ('Mathematics', 5, 'G5-049', 'Make models of solid figures.', 3, '8', NULL),
  ('Mathematics', 5, 'G5-050', 'Illustrate and find the surface area of solid figures.', 3, '8', NULL),
  ('Mathematics', 5, 'G5-051', 'Solve problems involving the surface area of solid figures.', 3, '9', NULL),
  ('Mathematics', 5, 'G5-052', 'Describe and distinguish cubes and rectangular prisms.', 3, '9', NULL),
  ('Mathematics', 5, 'G5-053', 'Estimate the volume of a cube and of a rectangular prism using non-standard units of measurement.', 3, '10', NULL),
  ('Mathematics', 5, 'G5-054', 'Draw the image of an object after applying rotation about a point given an angle of rotation, clockwise or counterclockwise.', 3, '10', NULL),
  ('Science', 5, 'G5-001', 'Describe matter as anything that has mass and takes up space.', 1, '1 to 2', NULL),
  ('Science', 5, 'G5-002', 'Identify that matter has (exists in) three states called solids, liquids, and gases.', 1, '1 to 2', NULL),
  ('Science', 5, 'G5-003', 'Describe the properties of solids, liquids, and gases in terms of shape and volume - solids: definite shape and volume', 1, '2 to 4', NULL),
  ('Science', 5, 'G5-004', 'Describe the properties of solids, liquids, and gases in terms of shape and volume - liquids: no definite shape; definite volume', 1, '2 to 4', NULL),
  ('Science', 5, 'G5-005', 'Describe the properties of solids, liquids, and gases in terms of shape and volume - gases: no definite shape or volume', 1, '2 to 4', NULL),
  ('Science', 5, 'G5-006', 'Identify objects at home and in the classroom as solid, liquid or gas.', 1, '2 to 4', NULL),
  ('Science', 5, 'G5-007', 'Use measuring cylinders or beakers to measure volume using units, such as milliliters (mL), and liters (L).', 1, '2 to 4', NULL),
  ('Science', 5, 'G5-008', 'Describe how changes in temperature cause matter to change in state, such as solid to liquid to gas.', 1, '2 to 4', NULL),
  ('Science', 5, 'G5-009', 'Describe the steps of a simple science investigation - What is the problem?', 1, '5 to 7', NULL),
  ('Science', 5, 'G5-010', 'Describe the steps of a simple science investigation - What materials do you need?', 1, '5 to 7', NULL),
  ('Science', 5, 'G5-011', 'Describe the steps of a simple science investigation - What do you need to do?', 1, '5 to 7', NULL),
  ('Science', 5, 'G5-012', 'Describe the steps of a simple science investigation - What have you found out/learned?', 1, '5 to 7', NULL),
  ('Science', 5, 'G5-013', 'Identify and appropriately use units in simple science activities, such as milligrams (mg,) grams (g), kilograms (kg), and degrees centigrade (oC).', 1, '5 to 7', NULL),
  ('Science', 5, 'G5-014', 'Plan simple scientific investigations in answering questions, such as “Do gases (like air) or liquids (like water) have mass?”, using appropriate simple science equipment, such as a balance, and a thermometer, with appropriate units.', 1, '5 to 7', NULL),
  ('Science', 5, 'G5-015', 'Use a table to show how living things can be classified into groups based on similar characteristics - plants including flowering and non-flowering', 1, '8 to 10', NULL),
  ('Science', 5, 'G5-016', 'Use a table to show how living things can be classified into groups based on similar characteristics - animals including mammals, reptiles, insects, birds, fish, amphibians, and reptiles', 1, '8 to 10', NULL),
  ('Science', 5, 'G5-017', 'Use a table to show how living things can be classified into groups based on similar characteristics - microorganisms including fungi and bacteria', 1, '8 to 10', NULL),
  ('Science', 5, 'G5-018', 'Describe the purpose of specialized structures in plants, such as rhizomes, tubers, thorns, bulbs, and aerial roots.', 1, '8 to 10', NULL),
  ('Science', 5, 'G5-019', 'Explain how some plants have adapted to unfavorable conditions in the environment, such as lack of rain or floods.', 1, '8 to 10', NULL),
  ('Science', 5, 'G5-020', 'Identify from pictures and labeled diagrams the parts of the digestive system as mouth, gullet, stomach, small intestine, and large intestine, and describe how they work.', 2, '1 to 3', NULL),
  ('Science', 5, 'G5-021', 'Identify from pictures and diagrams the parts of the respiratory system as the nose, windpipe, and lungs, and describe how they work.', 2, '1 to 3', NULL),
  ('Science', 5, 'G5-022', 'Identify from pictures and labeled diagrams the parts of the female reproductive system as ovaries, uterus, and vagina and those of the male reproductive system as the prostate, testis, and penis and describe how they work.', 2, '1 to 3', NULL),
  ('Science', 5, 'G5-023', 'Identify which groups of animals reproduce by giving birth to live young, such as mammals, and which reproduce by laying eggs, such as birds and reptiles.', 2, '4 to 6', NULL),
  ('Science', 5, 'G5-024', 'Use information from secondary sources to describe examples of how some animals have changed to better suit their environment, such as mimicry or camouflage.', 2, '4 to 6', NULL),
  ('Science', 5, 'G5-025', 'Compare the life cycles of mammals from birth to adulthood, birds from egg to a mature organism, and plants from seed to a young plant, and then to a mature plant.', 2, '4 to 6', NULL),
  ('Science', 5, 'G5-026', 'Carry out simple investigations to demonstrate that contact forces cause objects to move in the same direction as the direction that the force is applied.', 2, '7', NULL),
  ('Science', 5, 'G5-027', 'Plan and carry out a scientific investigation to determine the effect of different surfaces on the size of frictional forces.', 2, '8 to 9', NULL),
  ('Science', 5, 'G5-028', 'Demonstrate how friction can produce heat and investigate ways of reducing and increasing friction.', 2, '8 to 9', NULL),
  ('Science', 5, 'G5-029', 'Identify gravity as a non-contact force that affects the behaviors of materials and objects on Earth in predictable ways.', 2, '10 to 11', NULL),
  ('Science', 5, 'G5-030', 'Predict and explain whether heavier objects will fall faster than lighter objects due to the force of gravity.', 2, '10 to 11', NULL),
  ('Science', 5, 'G5-031', 'Observe and describe the effects of gravity to the motion of an object.', 2, '10 to 11', NULL),
  ('Science', 5, 'G5-032', 'Investigate the effects of static electricity using common materials, such as a comb, plastic and glass rods, and balloons.', 3, '1 to 2', NULL),
  ('Science', 5, 'G5-033', 'Assemble and draw a simple circuit using batteries, wires, switch, and bulb and/or toy motor or buzzer.', 3, '1 to 2', NULL),
  ('Science', 5, 'G5-034', 'Design and construct a simple electrical circuit to identify what materials will conduct electricity and use it to identify materials from the environment that will and will not conduct electricity.', 3, '1 to 2', NULL),
  ('Science', 5, 'G5-035', 'Make a simple electromagnet and observe and record its properties.', 3, '1 to 2', NULL),
  ('Science', 5, 'G5-036', 'Identify local examples of natural landforms and bodies of water such as mountains, valleys, rivers, and coastlines, and describe how they influence non-living and living components of the environment.', 3, '3 to 5', NULL),
  ('Science', 5, 'G5-037', 'Explore the school grounds or the local area to observe or collect different types of rocks, describing their similarities or differences in terms of their features, such as texture, color, and grain crystal size.', 3, '3 to 5', NULL),
  ('Science', 5, 'G5-038', 'Classify common rocks from provided samples using a simple rock classification system, such as a dichotomous key.', 3, '3 to 5', NULL),
  ('Science', 5, 'G5-039', 'Explain how soil is formed from rocks and minerals.', 3, '3 to 5', NULL),
  ('Science', 5, 'G5-040', 'Demonstrate how erosion transports Earth materials.', 3, '3 to 5', NULL),
  ('Science', 5, 'G5-041', 'Explain the role of the water cycle in the environment.', 3, '6', NULL),
  ('Science', 5, 'G5-042', 'Construct a model to communicate some of the key processes in the water cycle.', 3, '6', NULL),
  ('Science', 5, 'G5-043', 'Describe some effects of weather disturbances that occur in or near the Philippines.', 3, '7 to 9', NULL),
  ('Science', 5, 'G5-044', 'Describe the weather conditions according to a Public Storm Warning Signal issued by the Philippine Atmospheric, Geophysical and Astronomical Services Administration (PAGASA).', 3, '7 to 9', NULL),
  ('Science', 5, 'G5-045', 'Describe typical weather conditions before, during and after a tropical cyclone.', 3, '7 to 9', NULL),
  ('Science', 5, 'G5-046', 'Describe the general structure of the solar system, identifying the names of the major celestial objects, their main features, and general composition.', 3, '10 to 11', NULL),
  ('Science', 5, 'G5-047', 'Make drawings or a simple model to show the motion of the Earth and Moon relative to the Sun to explain the phases of the moon that people see from Earth.', 3, '10 to 11', NULL)
) AS v(area, grade_level, lc_code, competency_text, term, week, domain)
JOIN procurements.sms_learning_areas a ON lower(btrim(a.name)) = lower(btrim(v.area))
ON CONFLICT (learning_area_id, grade_level, lc_code) DO NOTHING;

/* Verification: after all 22 parts, seeded_entries = 6718. */
SELECT count(*) AS seeded_entries,
       count(DISTINCT learning_area_id) AS learning_areas
FROM procurements.sms_competency_catalogue
WHERE lc_code ~ '^(K|G[0-9]+)-[0-9]{3}$';
