-- ============================================================================
-- 208: Seed the competency catalogue from the MATATAG learning competencies
-- Part 12 of 22: Grade 7
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

/* Grade 7: 30 */
INSERT INTO procurements.sms_competency_catalogue
  (learning_area_id, grade_level, lc_code, competency_text, term, week, domain)
SELECT a.id, v.grade_level::int, v.lc_code::text, v.competency_text::text, v.term::smallint, v.week::text, v.domain::text
FROM (VALUES
  ('Values Education', 7, 'G7-055', 'Nakapagsasanay sa pagiging magalang sa pamamagitan ng pagiging sensitibo sa oras at gawain ng kapuwa na kabilang sa ibang pananampalataya - Natutukoy ang iba’t ibang kaugalian ng kapuwa na nakaugat sa pananampalataya', 3, '1 (5 days)', NULL),
  ('Values Education', 7, 'G7-056', 'Nakapagsasanay sa pagiging magalang sa pamamagitan ng pagiging sensitibo sa oras at gawain ng kapuwa na kabilang sa ibang pananampalataya - Naipaliliwanag na ang paggalang sa iba’t ibang kaugalian ng kapuwa na nakaugat sa pananampalataya ay nakatutulong sa pagpapanatili ng mapayapang ugnayan sa kabila ng pagkakaiba- iba ng sistema ng paniniwala', 3, '1 (5 days)', NULL),
  ('Values Education', 7, 'G7-057', 'Nakapagsasanay sa pagiging magalang sa pamamagitan ng pagiging sensitibo sa oras at gawain ng kapuwa na kabilang sa ibang pananampalataya - Naisasakilos ang wastong pagtugon sa mga kaugalian ng kapuwa na nakaugat sa pananampalataya', 3, '1 (5 days)', NULL),
  ('Values Education', 7, 'G7-058', 'Nakapagsasanay sa pagiging mapagmalasakit sa kapuwa sa pamamagitan ng paglalaan ng bahagi ng anumang halaga, gamit, oras o kasanayan para sa kapuwa batay sa kaniyang kakayahan - Nailalarawan ang mga paraan ng paglilingkod sa kapuwa bilang indikasyon ng pananampalataya', 3, '2 (5 days)', NULL),
  ('Values Education', 7, 'G7-059', 'Nakapagsasanay sa pagiging mapagmalasakit sa kapuwa sa pamamagitan ng paglalaan ng bahagi ng anumang halaga, gamit, oras o kasanayan para sa kapuwa batay sa kaniyang kakayahan - Naipaliliwanag na ang paglilingkod sa kapuwa bilang indikasyon ng pananampalataya ay pinagmumulan ng pagkukusang gumawa ng kabutihan lalo na sa mahihirap, mahihina, at nasa laylayan ng lipunan ayon sa sariling kakayahan', 3, '2 (5 days)', NULL),
  ('Values Education', 7, 'G7-060', 'Nakapagsasanay sa pagiging mapagmalasakit sa kapuwa sa pamamagitan ng paglalaan ng bahagi ng anumang halaga, gamit, oras o kasanayan para sa kapuwa batay sa kaniyang kakayahan - Nailalapat ang paglilingkod sa kapuwa bilang indikasyon ng pananampalataya', 3, '2 (5 days)', NULL),
  ('Values Education', 7, 'G7-061', 'Naisasabuhay ang pagiging matipid sa pamamagitan ng panghihikayat sa kapuwa na pahalagahan ang tubig at enerhiya sa lahat ng oras - Nakapagpapahayag ng mga wastong paraan ng paggamit ng tubig at enerhiya katuwang ang kapuwa', 3, '3 (5 days)', NULL),
  ('Values Education', 7, 'G7-062', 'Naisasabuhay ang pagiging matipid sa pamamagitan ng panghihikayat sa kapuwa na pahalagahan ang tubig at enerhiya sa lahat ng oras - Nahihinuha na ang wastong paggamit ng tubig at enerhiya katuwang ang kapuwa ay paggampan sa tungkuling tumulong sa pagtitiyak at pagpapanatili ng mga ito', 3, '3 (5 days)', NULL),
  ('Values Education', 7, 'G7-063', 'Naisasabuhay ang pagiging matipid sa pamamagitan ng panghihikayat sa kapuwa na pahalagahan ang tubig at enerhiya sa lahat ng oras - Naisasakilos ang mga wastong paraan ng paggamit ng tubig at enerhiya katuwang ang kapuwa', 3, '3 (5 days)', NULL),
  ('Values Education', 7, 'G7-064', 'Nakapagsasanay sa maingat na paghusga sa pamamagitan ng pagbibigay- kahulugan sa mga ugnayang nahinuha sa kasaysayan at kasalukuyang panahon batay sa mga mapagkakatiwalaang datos o impormasyon - Nailalarawan ang impluwensiya ng kasaysayan ng bansa sa pakikipagkapuwa', 3, '4 to 5 (8 days)', NULL),
  ('Values Education', 7, 'G7-065', 'Nakapagsasanay sa maingat na paghusga sa pamamagitan ng pagbibigay- kahulugan sa mga ugnayang nahinuha sa kasaysayan at kasalukuyang panahon batay sa mga mapagkakatiwalaang datos o impormasyon - Napatutunayan na ang impluwensiya ng kasaysayan ng bayan sa pakikipagkapuwa ay nagbukas ng kamalayan sa mga ugnayang lumilinang ng mabuting pagka-Pilipino na magsisilbing batayan sa pagharap sa mga isyu ng bayan', 3, '4 to 5 (8 days)', NULL),
  ('Values Education', 7, 'G7-066', 'Nakapagsasanay sa maingat na paghusga sa pamamagitan ng pagbibigay- kahulugan sa mga ugnayang nahinuha sa kasaysayan at kasalukuyang panahon batay sa mga mapagkakatiwalaang datos o impormasyon - Naisasakatuparan ang mga kilos na nagpapahalaga sa impluwensiya ng kasaysayan ng bansa sa pakikipagkapuwa', 3, '4 to 5 (8 days)', NULL),
  ('Values Education', 7, 'G7-067', 'Nakapagsasanay sa karunungan sa pamamagitan ng pagtitimbang-timbang sa mga kahihinatnan ng mga pasiya mula sa pagkilatis sa mga katangian ng mga pinuno - Nailalarawan ang gampanin ng pamilya bilang gabay sa pagpili ng mga mabuting pinuno sa komunidad at bayan', 3, '6 to 7 (8 days)', NULL),
  ('Values Education', 7, 'G7-068', 'Nakapagsasanay sa karunungan sa pamamagitan ng pagtitimbang-timbang sa mga kahihinatnan ng mga pasiya mula sa pagkilatis sa mga katangian ng mga pinuno - Naipaliliwanag na ang pamilya bilang gabay sa pagpili ng mga mabuting pinuno sa komunidad at bayan ay sandigan ng mga matibay at wastong batayan sa pagkilatis o pag-alam sa mga mabuting katangian ng lider na maglilingkod sa bayan', 3, '6 to 7 (8 days)', NULL),
  ('Values Education', 7, 'G7-069', 'Nakapagsasanay sa karunungan sa pamamagitan ng pagtitimbang-timbang sa mga kahihinatnan ng mga pasiya mula sa pagkilatis sa mga katangian ng mga pinuno - Naisasakilos ang wastong pagkilatis sa mga pinuno na may mga mabuting katangian ayon sa gabay ng pamilya', 3, '6 to 7 (8 days)', NULL),
  ('Values Education', 7, 'G7-070', 'Nakapagsasanay sa disiplina sa pamamagitan ng pag- iingat sa mga inilalagay sa sariling social media at mensahe sa iba - Nakakikilala ng mga paraan ng mapanagutang paggamit ng social media bilang mamamayan', 3, '8 (5 days)', NULL),
  ('Values Education', 7, 'G7-071', 'Nakapagsasanay sa disiplina sa pamamagitan ng pag- iingat sa mga inilalagay sa sariling social media at mensahe sa iba - Napatutunayan na ang mapanagutang paggamit ng social media bilang mamamayan ay paraan upang magkaroon ng mabuting pakikipag-ugnayan sa kapuwa at katiwasayan ng bayan', 3, '8 (5 days)', NULL),
  ('Values Education', 7, 'G7-072', 'Nakapagsasanay sa disiplina sa pamamagitan ng pag- iingat sa mga inilalagay sa sariling social media at mensahe sa iba - Naisasakilos ang mga paraan ng mapanagutang paggamit ng social media bilang mamamayan', 3, '8 (5 days)', NULL),
  ('Values Education', 7, 'G7-073', 'Nakapagsasanay sa pagiging mapanagutan sa pamamagitan ng pagtitiyak sa kabutihan at saysay ng mga gawain para sa bayan - Nakapag-uugnay sa papel ng espirituwalidad sa pagiging mabuting mamamayan', 3, '9 to 10 (8 days)', NULL),
  ('Values Education', 7, 'G7-074', 'Nakapagsasanay sa pagiging mapanagutan sa pamamagitan ng pagtitiyak sa kabutihan at saysay ng mga gawain para sa bayan - Naipaliliwanag na ang papel ng espirituwalidad sa pagiging mabuting mamamayan ay nakatutulong sa pagganap ng kaniyang tungkulin sa bayan nang mapanagutan bilang indikasyon ng pag- unawa sa dahilan ng kaniyang pag-iral', 3, '9 to 10 (8 days)', NULL),
  ('Values Education', 7, 'G7-075', 'Nakapagsasanay sa pagiging mapanagutan sa pamamagitan ng pagtitiyak sa kabutihan at saysay ng mga gawain para sa bayan - Naisasakilos ang mga paraan sa pagganap ng kaniyang tungkulin sa pamayanan na ginagabayan ng espirituwalidad', 3, '9 to 10 (8 days)', NULL),
  ('Values Education', 7, 'G7-076', 'Nakapagsasanay sa pagiging matiyaga sa pamamagitan ng pagpapahayag ng mga bagong natuklasan at epekto nito sa sariling pagpapasiya at kilos bilang bahagi ng pagninilay - Nakapagpapahayag ng mga reyalisasyon (insight) mula sa pagninilay sa mga isyu ng bayan', 3, '11 (5 days)', NULL),
  ('Values Education', 7, 'G7-077', 'Nakapagsasanay sa pagiging matiyaga sa pamamagitan ng pagpapahayag ng mga bagong natuklasan at epekto nito sa sariling pagpapasiya at kilos bilang bahagi ng pagninilay - Napatutunayan na ang pagninilay sa mga isyu ng bayan bilang bahagi ng espirituwalidad ay kailangan upang mabigyan ng wastong kahulugan ang mga pangyayari sa paligid na magiging batayan ng kaniyang pagpapasiya at pakikisangkot ayon sa sariling kakayahan', 3, '11 (5 days)', NULL),
  ('Values Education', 7, 'G7-078', 'Nakapagsasanay sa pagiging matiyaga sa pamamagitan ng pagpapahayag ng mga bagong natuklasan at epekto nito sa sariling pagpapasiya at kilos bilang bahagi ng pagninilay - Naisasakilos ang pagninilay sa mga isyu ng bayan bilang bahagi ng espirituwalidad', 3, '11 (5 days)', NULL),
  ('Values Education', 7, 'G7-079', 'Nakapagsasanay sa pagiging mabuting katiwala sa pamamagitan ng pagpapalaganap ng wastong paraan sa pagpapanatili ng panahanan (habitat) ng mga hayop sa pamayanan - Naiisa-isa ang mga paraan ng pagpapanatili ng panahanan (habitat) ng mga hayop sa pamayanan', 3, '12 to 13 (9 days)', NULL),
  ('Values Education', 7, 'G7-080', 'Nakapagsasanay sa pagiging mabuting katiwala sa pamamagitan ng pagpapalaganap ng wastong paraan sa pagpapanatili ng panahanan (habitat) ng mga hayop sa pamayanan - Naipaliliwanag na ang pagpapanatili ng panahanan (habitat) ng mga hayop sa pamayanan ay lilikha ng balanse sa kalikasan o biodiversity upang mamuhay nang ligtas at mapayapa bilang bahagi ng tungkulin ng bawat mamamayan', 3, '12 to 13 (9 days)', NULL),
  ('Values Education', 7, 'G7-081', 'Nakapaglalapat ng mga hakbang upang mapanatili ang mga panahanan (habitat) ng mga hayop sa pamayanan', 3, '12 to 13 (9 days)', NULL),
  ('Values Education', 7, 'G7-082', 'Nakapagsasanay sa pagiging malikhain sa pamamagitan ng pagiging sensitibo sa mga maliliit na suliranin sa pamayanan upang mabigyan ng solusyon gamit ang glokalisasyon ayon sa kaniyang kakayahan - Nakakikilala ng kabutihan ng glokalisasyon bilang tugon sa suliranin ng bayan', 3, '14 (5 days)', NULL),
  ('Values Education', 7, 'G7-083', 'Nakapagsasanay sa pagiging malikhain sa pamamagitan ng pagiging sensitibo sa mga maliliit na suliranin sa pamayanan upang mabigyan ng solusyon gamit ang glokalisasyon ayon sa kaniyang kakayahan - Naipaliliwanag na ang glokalisasyon bilang tugon sa mga suliranin ng bayan ay pakikibahagi sa pamayanan gamit ang malikhaing paraan at inspirasyon mula sa ibang bansa tungo sa paglinang ng pambansang pagkakakilanlan', 3, '14 (5 days)', NULL),
  ('Values Education', 7, 'G7-084', 'Nakapagsasanay sa pagiging malikhain sa pamamagitan ng pagiging sensitibo sa mga maliliit na suliranin sa pamayanan upang mabigyan ng solusyon gamit ang glokalisasyon ayon sa kaniyang kakayahan - Nakalilikha ng produkto o serbisyo na tumutugon sa pangangailangan ng pamayanang kinabibilangan alinsunod sa glokalisasyon', 3, '14 (5 days)', NULL)
) AS v(area, grade_level, lc_code, competency_text, term, week, domain)
JOIN procurements.sms_learning_areas a ON lower(btrim(a.name)) = lower(btrim(v.area))
ON CONFLICT (learning_area_id, grade_level, lc_code) DO NOTHING;

/* Verification: after all 22 parts, seeded_entries = 6718. */
SELECT count(*) AS seeded_entries,
       count(DISTINCT learning_area_id) AS learning_areas
FROM procurements.sms_competency_catalogue
WHERE lc_code ~ '^(K|G[0-9]+)-[0-9]{3}$';
