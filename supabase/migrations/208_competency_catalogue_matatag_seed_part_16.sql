-- ============================================================================
-- 208: Seed the competency catalogue from the MATATAG learning competencies
-- Part 16 of 22: Grade 9
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
  ('Values Education')
ON CONFLICT ((lower(btrim(name)))) DO NOTHING;

/* Grade 9: 24 */
INSERT INTO procurements.sms_competency_catalogue
  (learning_area_id, grade_level, lc_code, competency_text, term, week, domain)
SELECT a.id, v.grade_level::int, v.lc_code::text, v.competency_text::text, v.term::smallint, v.week::text, v.domain::text
FROM (VALUES
  ('Values Education', 9, 'G9-061', 'Naisasabuhay ang pakikiisa sa pamamagitan ng pagpapalaganap ng kabutihang dulot ng pakikilahok at bolunterismo para sa kalikasan - Naiisa-isa ang mga paraan ng pakikilahok at bolunterismo sa pagkalinga sa kalikasan katuwang ang kapuwa', 3, '4 (5 days)', NULL),
  ('Values Education', 9, 'G9-062', 'Naisasabuhay ang pakikiisa sa pamamagitan ng pagpapalaganap ng kabutihang dulot ng pakikilahok at bolunterismo para sa kalikasan - Naipaliliwanag na ang pakikilahok at bolunterismo sa pagkalinga sa kalikasan katuwang ang kapuwa ay kinakailangan upang kagyat na matupad ang tungkulin bilang isang mabuting katiwala at matiyak na mapanatili ang balanse nito', 3, '4 (5 days)', NULL),
  ('Values Education', 9, 'G9-063', 'Naisasabuhay ang pakikiisa sa pamamagitan ng pagpapalaganap ng kabutihang dulot ng pakikilahok at bolunterismo para sa kalikasan - Naisasakilos ang pakikilahok at bolunterismo sa pagkalinga sa kalikasan katuwang ang kapuwa', 3, '4 (5 days)', NULL),
  ('Values Education', 9, 'G9-064', 'Naisasabuhay ang pagiging mapanagutan sa pamamagitan ng pakikipag-ugnayan at pagpapasiya batay sa obhektibong pagtingin sa mga impormasyon o datos - Nakapagpapahayag ng ibat -ibang isyung panlipunan na nakaiimpluwensiya sa pakikipagkapuwa', 3, '5 (5 days)', NULL),
  ('Values Education', 9, 'G9-065', 'Naisasabuhay ang pagiging mapanagutan sa pamamagitan ng pakikipag-ugnayan at pagpapasiya batay sa obhektibong pagtingin sa mga impormasyon o datos - Napatutunayan na ang mga isyung panlipunan na nakaiimpluwensiya sa pakikipagkapuwa ay nangangailangan nang wasto at kolektibong pagtugon ng mamamayan upang maiwasan ang mga kaakibat nitong suliranin', 3, '5 (5 days)', NULL),
  ('Values Education', 9, 'G9-066', 'Naisasabuhay ang pagiging mapanagutan sa pamamagitan ng pakikipag-ugnayan at pagpapasiya batay sa obhektibong pagtingin sa mga impormasyon o datos - Nakabubuo ng kongkreto at positibong pagtugon sa mga isyung panlipunan na nakaiimpluwensiya sa pakikipagkapuwa', 3, '5 (5 days)', NULL),
  ('Values Education', 9, 'G9-067', 'Nakapagsasanay sa pagiging makatarungan sa pamamagitan ng pagkilos nang patas at pantay na pakikisalamuha sa kapuwa - Nakapagpapahayag ng mga paraan ng makatuwirang pagkilos katuwang ang pamilya sa pagsusulong ng kabutihan sa lipunan', 3, '6 to 7 (10 days)', NULL),
  ('Values Education', 9, 'G9-068', 'Nakapagsasanay sa pagiging makatarungan sa pamamagitan ng pagkilos nang patas at pantay na pakikisalamuha sa kapuwa - Naipaliliwanag na ang makatuwirang pagkilos katuwang ang pamilya sa pagsusulong ng kabutihan sa lipunan ay pagkilala ng dignidad na taglay ng bawat mamamayan anuman ang estado sa buhay tungo sa matiwasay na pamayanan', 3, '6 to 7 (10 days)', NULL),
  ('Values Education', 9, 'G9-069', 'Nakapagsasanay sa pagiging makatarungan sa pamamagitan ng pagkilos nang patas at pantay na pakikisalamuha sa kapuwa - Nailalapat ang sariling paraan ng makatuwirang pagkilos katuwang ang pamilya sa pagsusulong ng kabutihan sa lipunan', 3, '6 to 7 (10 days)', NULL),
  ('Values Education', 9, 'G9-070', 'Naisasabuhay ang pagiging matipid sa pamamagitan ng pagtatabi ng mga pera o gamit upang makibahagi sa pagtugon ng pangangailangang pangkabuhayan sa lipunan ayon sa kakayahan - Naiisa-isa ang mga paraan ng pagtitipid at pag-iimpok katuwang ang kapuwa tungo sa pagpapabuti ng lipunan', 3, '8 (5 days)', NULL),
  ('Values Education', 9, 'G9-071', 'Naisasabuhay ang pagiging matipid sa pamamagitan ng pagtatabi ng mga pera o gamit upang makibahagi sa pagtugon ng pangangailangang pangkabuhayan sa lipunan ayon sa kakayahan - Naipaliliwanag na ang pagtitipid at pag-iimpok katuwang ang kapuwa tungo sa pagpapabuti ng lipunan ay nagdudulot ng kamalayan sa kahalagahan ng sama-samang pag-iipon upang makibahagi sa pagtugon ng pangangailangang pangkabuhayan sa lipunan', 3, '8 (5 days)', NULL),
  ('Values Education', 9, 'G9-072', 'Naisasabuhay ang pagiging matipid sa pamamagitan ng pagtatabi ng mga pera o gamit upang makibahagi sa pagtugon ng pangangailangang pangkabuhayan sa lipunan ayon sa kakayahan - Naisasakilos ang sariling paraan ng pagtitipid at pag- iimpok katuwang ang kapuwa tungo sa pagpapabuti ng lipunan', 3, '8 (5 days)', NULL),
  ('Values Education', 9, 'G9-073', 'Naisasabuhay ang pagiging matatag sa pamamagitan ng palagiang pagninilay, pananalangin sa Diyos at pagdalo sa mga gawaing magpapapalalim ng ispiritwalidad - Nakapagpapahayag ng mga paraan ng pagpapalalim ng ispirituwalidad na gabay sa pagharap sa pagsubok ng buhay', 3, '9 (5 days)', NULL),
  ('Values Education', 9, 'G9-074', 'Naisasabuhay ang pagiging matatag sa pamamagitan ng palagiang pagninilay, pananalangin sa Diyos at pagdalo sa mga gawaing magpapapalalim ng ispiritwalidad - Napapatunayan na ang pagpapalalim ng ispirituwalidad na gabay sa pagharap sa pagsubok ng buhay ay paraan na maaaring taglayin ng isang indibidwal upang magkaroon ng lubos na paninindigan at pag-asa sa anumang suliranin na kahaharapin', 3, '9 (5 days)', NULL),
  ('Values Education', 9, 'G9-075', 'Naisasabuhay ang pagiging matatag sa pamamagitan ng palagiang pagninilay, pananalangin sa Diyos at pagdalo sa mga gawaing magpapapalalim ng ispiritwalidad - Naisasakilos ang mga paraan ng pagpapalalim ng ispirituwalidad na gabay sa pagharap sa pagsubok ng buhay', 3, '9 (5 days)', NULL),
  ('Values Education', 9, 'G9-076', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng pagsuporta at pakikilahok sa mga proyektong panrelihiyon na nagsusulong sa pagpapabuti ng kalagayan ng kapuwa - Naiisa-isa ang mga gawaing panrelihiyon na nagsusulong sa pagpapabuti ng kalagayan ng kapuwa', 3, '10 (5 days)', NULL),
  ('Values Education', 9, 'G9-077', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng pagsuporta at pakikilahok sa mga proyektong panrelihiyon na nagsusulong sa pagpapabuti ng kalagayan ng kapuwa - Naipaliliwanag na ang mga gawaing panrelihiyon na nagsusulong sa pagpapabuti ng kalagayan ng kapuwa ay magbibigay pag-asa at positibong pananaw sa pagtugon sa pagpapabuti ng lipunan at tiyakin ang positibong ugnayan ng bawat isa', 3, '10 (5 days)', NULL),
  ('Values Education', 9, 'G9-078', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng pagsuporta at pakikilahok sa mga proyektong panrelihiyon na nagsusulong sa pagpapabuti ng kalagayan ng kapuwa - Naisasakilos ang mga gawaing panrelihiyon na nagsusulong sa pagpapabuti ng kalagayan ng kapuwa', 3, '10 (5 days)', NULL),
  ('Values Education', 9, 'G9-079', 'Naisasabuhay ang pagiging mabuting katiwala sa pamamagitan ng palagiang pakikilahok sa mga proyektong pangkapaligiran - Nakakikilala ng mga paraan ng pagsuporta sa adbokasiya ng mga lokal na pangkat na nangangalaga sa kalikasan', 3, '11 (5 days)', NULL),
  ('Values Education', 9, 'G9-080', 'Naisasabuhay ang pagiging mabuting katiwala sa pamamagitan ng palagiang pakikilahok sa mga proyektong pangkapaligiran - Naipaliliwanag na ang pagsuporta sa adbokasiya ng mga lokal na pangkat na nangangalaga sa kalikasan ay nagtitiyak ng pagpapabuti ng kalagayan ng kapaligiran tungo sa kapakanan ng bawat mamamayan', 3, '11 (5 days)', NULL),
  ('Values Education', 9, 'G9-081', 'Naisasabuhay ang pagiging mabuting katiwala sa pamamagitan ng palagiang pakikilahok sa mga proyektong pangkapaligiran - Nailalapat ang sariling paraan ng pagsuporta sa adbokasiya ng mga lokal na pangkat na nangangalaga sa kalikasan', 3, '11 (5 days)', NULL),
  ('Values Education', 9, 'G9-082', 'Nakapagsasanay ng nasyonalismo sa pamamagitan ng pagbibigay prayoridad na bumili ng produkto, piliin ang serbisyo, at ipagmalaki ang talentong Pilipino - Nakapagpapahayag ng mga paraan ng pagpapaunalad ng gawi sa pagtangkilik sa mga serbisyo, talento, at produktong gawang Pilipino', 3, '12 to 13 (10 days)', NULL),
  ('Values Education', 9, 'G9-083', 'Nakapagsasanay ng nasyonalismo sa pamamagitan ng pagbibigay prayoridad na bumili ng produkto, piliin ang serbisyo, at ipagmalaki ang talentong Pilipino - Napatutunayan na ang pagpapaunlad ng gawi sa pagtangkilik sa mga serbisyo, talento, at produktong gawang Pilipino ay nagpapakita ng malaking ambag ng bawat Pilipino upang mapalakas, mapasigla, at maalagaan ang maliliit na negosyo sa lipunan tungo sa ikabubuti ng lahat', 3, '12 to 13 (10 days)', NULL),
  ('Values Education', 9, 'G9-084', 'Nakapagsasanay ng nasyonalismo sa pamamagitan ng pagbibigay prayoridad na bumili ng produkto, piliin ang serbisyo, at ipagmalaki ang talentong Pilipino - Naisasakilos ang sariling paraan ng pagpapaunlad ng gawi sa pagtangkilik sa mga serbisyo, talento, at produktong gawang Pilipino', 3, '12 to 13 (10 days)', NULL)
) AS v(area, grade_level, lc_code, competency_text, term, week, domain)
JOIN procurements.sms_learning_areas a ON lower(btrim(a.name)) = lower(btrim(v.area))
ON CONFLICT (learning_area_id, grade_level, lc_code) DO NOTHING;

/* Verification: after all 22 parts, seeded_entries = 6718. */
SELECT count(*) AS seeded_entries,
       count(DISTINCT learning_area_id) AS learning_areas
FROM procurements.sms_competency_catalogue
WHERE lc_code ~ '^(K|G[0-9]+)-[0-9]{3}$';
