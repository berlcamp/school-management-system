-- ============================================================================
-- 208: Seed the competency catalogue from the MATATAG learning competencies
-- Part 14 of 22: Grade 8
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

/* Grade 8: 36 */
INSERT INTO procurements.sms_competency_catalogue
  (learning_area_id, grade_level, lc_code, competency_text, term, week, domain)
SELECT a.id, v.grade_level::int, v.lc_code::text, v.competency_text::text, v.term::smallint, v.week::text, v.domain::text
FROM (VALUES
  ('Values Education', 8, 'G8-049', 'Nakapagsasanay sa pagiging mapagpasensiya sa pamamagitan ng pagsasagawa ng mga paraan ng positibong pagpapayapa ng isip at damdamin - Nakapagpapahayag ng mga wastong paraan ng pamamahala ng ugnayan kapag may hindi pagkakaunawaan sa kapuwa.', 2, '14 (5 days)', NULL),
  ('Values Education', 8, 'G8-050', 'Nakapagsasanay sa pagiging mapagpasensiya sa pamamagitan ng pagsasagawa ng mga paraan ng positibong pagpapayapa ng isip at damdamin - Naipaliliwanag na ang pamamahala ng ugnayan sa panahon ng hindi pagkakaunawaan sa kapuwa ay mahalaga para maisalba ang mabuting ugnayan at mapairal ang kahinahunan upang makaiwas mula sa mga hindi inaasahang kahihinatnan.', 2, '14 (5 days)', NULL),
  ('Values Education', 8, 'G8-051', 'Nakapagsasanay sa pagiging mapagpasensiya sa pamamagitan ng pagsasagawa ng mga paraan ng positibong pagpapayapa ng isip at damdamin - Naisasakilos ang mga wastong paraan ng pamamahala ng ugnayan kapag may hindi pagkakaunawaan sa kapuwa.', 2, '14 (5 days)', NULL),
  ('Values Education', 8, 'G8-052', 'Naisasabuhay ang pagiging magalang sa pamamagitan ng panghihikayat sa mga kamag-aral na isabuhay ang positibong pananaw sa seksuwalidad. - Nakakikilala ng iba’t ibang pananaw sa seksuwalidad.', 2, '15 (4 days)', NULL),
  ('Values Education', 8, 'G8-053', 'Naisasabuhay ang pagiging magalang sa pamamagitan ng panghihikayat sa mga kamag-aral na isabuhay ang positibong pananaw sa seksuwalidad. - Naipaliliwanag na ang positibong pananaw sa seksuwalidad ng sarili at kapuwa ay mahalaga sa pagbuo ng sariling pagkakakilanlan at paggalang sa kapuwa.', 2, '15 (4 days)', NULL),
  ('Values Education', 8, 'G8-054', 'Naisasabuhay ang pagiging magalang sa pamamagitan ng panghihikayat sa mga kamag-aral na isabuhay ang positibong pananaw sa seksuwalidad. - Nakapaglalapat ng mga paraan sa pagpapanatili ng positibong pag-iisip tungkol sa seksuwalidad ng sarili at kapuwa.', 2, '15 (4 days)', NULL),
  ('Values Education', 8, 'G8-055', 'Nakapagsasanay sa pagiging magalang sa pamamagitan ng angkop na pagtugon kapag pinag-uusapan ang mga pagkakaiba-iba sa paniniwala ng iba’t ibang paniniwala o relihiyon. - Naiisa-isa ang mga wastong paraan ng pakikipag- ugnayan sa kapuwa sa kabila ng pagkakaiba-iba sa paniniwala o relihiyon.', 3, '1 (5 days)', NULL),
  ('Values Education', 8, 'G8-056', 'Nakapagsasanay sa pagiging magalang sa pamamagitan ng angkop na pagtugon kapag pinag-uusapan ang mga pagkakaiba-iba sa paniniwala ng iba’t ibang paniniwala o relihiyon. - Napatutunayan na ang pakipag-ugnayan sa kapuwa sa kabila ng pagkakaiba-iba ng paniniwala o relihiyon ay pagtitiyak ng mapayapang pamumuhay kasama ang ibang tao.', 3, '1 (5 days)', NULL),
  ('Values Education', 8, 'G8-057', 'Nakapagsasanay sa pagiging magalang sa pamamagitan ng angkop na pagtugon kapag pinag-uusapan ang mga pagkakaiba-iba sa paniniwala ng iba’t ibang paniniwala o relihiyon. - Nakapaglalapat ng mga wastong paraan ng pakikag- ugnayan sa kapuwa sa kabila ng pagkakaiba-iba ng paniniwala o relihiyon.', 3, '1 (5 days)', NULL),
  ('Values Education', 8, 'G8-058', 'Naisasabuhay ang pagiging mapaglingkod sa pamamagitan ng pagkalinga sa kapuwa. - Nailalarawan ang mga paraan ng pagkalinga sa kapuwa bilang indikasyon ng pananampalataya.', 3, '2 to 3 (8 days)', NULL),
  ('Values Education', 8, 'G8-059', 'Naisasabuhay ang pagiging mapaglingkod sa pamamagitan ng pagkalinga sa kapuwa. - Naipaliliwanag na ang pagkalinga sa kapuwa bilang indikasyon ng pananampalataya ay patunay ng pagmamahal sa Diyos at pagtupad sa tungkuling maglingkod sa kapuwa.', 3, '2 to 3 (8 days)', NULL),
  ('Values Education', 8, 'G8-060', 'Naisasabuhay ang pagiging mapaglingkod sa pamamagitan ng pagkalinga sa kapuwa. - Naisasakilos ang mga sariling paraan ng pagkalinga sa kapuwa bilang indikasyon ng pananampalataya.', 3, '2 to 3 (8 days)', NULL),
  ('Values Education', 8, 'G8-061', 'Nakapagsasanay sa pagiging mapagmalasakit sa mga hayop sa pamamagitan ng pagbibigay ng kailangang resorses ng mga ito ayon sa sariling kakayahan. - Nakakikilala ng mga paraan ng pangangalaga sa mga hayop katuwang ang kapuwa.', 3, '4 (5 days)', NULL),
  ('Values Education', 8, 'G8-062', 'Nakapagsasanay sa pagiging mapagmalasakit sa mga hayop sa pamamagitan ng pagbibigay ng kailangang resorses ng mga ito ayon sa sariling kakayahan. - Napatutunayan na ang pangangalaga sa mga hayop katuwang ang kapuwa ay aktibong pakikibahagi bilang mabuting katiwala ng mga nilikha ng Diyos.', 3, '4 (5 days)', NULL),
  ('Values Education', 8, 'G8-063', 'Nakapagsasanay sa pagiging mapagmalasakit sa mga hayop sa pamamagitan ng pagbibigay ng kailangang resorses ng mga ito ayon sa sariling kakayahan. - Nailalapat ang mga paraan ng pangangalaga sa mga hayop katuwang ang kapuwa.', 3, '4 (5 days)', NULL),
  ('Values Education', 8, 'G8-064', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng wastong pakikitungo sa ibang lahi kung may pagkakataon o pakikisangkot sa mga pandaigdigang gawain na nagsusulong ng kabutihang panlahat. - Natutukoy ang mga katangian ng Pilipino bilang kapuwa mamamayan ng daigdig.', 3, '5 (5 days)', NULL),
  ('Values Education', 8, 'G8-065', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng wastong pakikitungo sa ibang lahi kung may pagkakataon o pakikisangkot sa mga pandaigdigang gawain na nagsusulong ng kabutihang panlahat. - Nahihinuha na ang mga Pilipino bilang kapuwa mamamayan ng daigdig ay may katangi-tanging paraan ng pagkalinga sa kapuwa sa kabila ng pagkakaiba-iba ng lahi at may kakayahang makiisa sa mga pandaigdigang gawain na nagsusulong ng kabutihang panlahat.', 3, '5 (5 days)', NULL),
  ('Values Education', 8, 'G8-066', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng wastong pakikitungo sa ibang lahi kung may pagkakataon o pakikisangkot sa mga pandaigdigang gawain na nagsusulong ng kabutihang panlahat. - Naipakikita ang mga katangian ng Pilipino bilang kapuwa mamamayan ng daigdig.', 3, '5 (5 days)', NULL),
  ('Values Education', 8, 'G8-067', 'Nakapagsasanay ng nasyonalismo sa pamamagitan ng kahandaan sa kahihinatnan ng mga sariling pasiya o kilos sa kapuwa mamamayan. - Nakapagpapahayag ng mga paraan ng paggamit ng kalayaan sa mapanagutang pagsunod sa mga alituntunin sa bayan.', 3, '6 to 7 (10 days)', NULL),
  ('Values Education', 8, 'G8-068', 'Nakapagsasanay ng nasyonalismo sa pamamagitan ng kahandaan sa kahihinatnan ng mga sariling pasiya o kilos sa kapuwa mamamayan. - Natutuklasan na ang paggamit ng kalayaan sa mapanagutang pagsunod sa mga alituntunin ay may kaakibat na tungkuling piliin at gawin ang mabuti para sa bayan.', 3, '6 to 7 (10 days)', NULL),
  ('Values Education', 8, 'G8-069', 'Nakapagsasanay ng nasyonalismo sa pamamagitan ng kahandaan sa kahihinatnan ng mga sariling pasiya o kilos sa kapuwa mamamayan. - Nailalapat ang mga paraan ng paggamit ng kalayaan sa mapanagutang pagsunod sa mga alituntunin sa bayan ayon sa kaniyang kakayahan.', 3, '6 to 7 (10 days)', NULL),
  ('Values Education', 8, 'G8-070', 'Nakapagsasanay sa pagiging patas sa pamamagitan ng walang paghuhusgang pakikipag-ugnayan sa kanila at pagkilala sa pagkakaiba-iba at pagkakatulad sa pagtupad sa kanilang tungkulin sa pamayanan. - Nailalarawan ang makataong pakikipag-ugnayan sa bayan.', 3, '8 (5 days)', NULL),
  ('Values Education', 8, 'G8-071', 'Nakapagsasanay sa pagiging patas sa pamamagitan ng walang paghuhusgang pakikipag-ugnayan sa kanila at pagkilala sa pagkakaiba-iba at pagkakatulad sa pagtupad sa kanilang tungkulin sa pamayanan. - Naipaliliwanag na ang makataong pakikipag-ugnayan sa bayan ay nagpapakita ng patas na pakikitungo (fair treatment) sa kapuwa anuman ang kanilang kasarian, kakayahan, katayuan sa buhay, relihiyon o paniniwala, at ideyolohiya bilang paggalang sa kanilang dignidad.', 3, '8 (5 days)', NULL),
  ('Values Education', 8, 'G8-072', 'Nakapagsasanay sa pagiging patas sa pamamagitan ng walang paghuhusgang pakikipag-ugnayan sa kanila at pagkilala sa pagkakaiba-iba at pagkakatulad sa pagtupad sa kanilang tungkulin sa pamayanan. - Naisasakilos ang makataong pakikipag-ugnayan sa bayan.', 3, '8 (5 days)', NULL),
  ('Values Education', 8, 'G8-073', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng pagkukusang maging bahagi ng mga gawain ng relihiyon o paniniwalang kinabibilangan. - Naiisa-isa ang mga gampanin ng kinabibilangang relihiyon o paniniwala.', 3, '9 (5 days)', NULL),
  ('Values Education', 8, 'G8-074', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng pagkukusang maging bahagi ng mga gawain ng relihiyon o paniniwalang kinabibilangan. - Nakapagpapatibay na ang pagtupad sa mga gampanin ng kinabibilangang relihiyon o paniniwala ay mapagkukunan ng inspirasyon, pag-asa at karunungan sa pamumuhay sa bayan.', 3, '9 (5 days)', NULL),
  ('Values Education', 8, 'G8-075', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng pagkukusang maging bahagi ng mga gawain ng relihiyon o paniniwalang kinabibilangan. - Nakikibahagi sa pagtupad sa mga gampanin ng kinabibilangang relihiyon o paniniwala.', 3, '9 (5 days)', NULL),
  ('Values Education', 8, 'G8-076', 'Nakapagsasanay sa pagiging mapagbigay sa pamamagitan ng kusang-loob na pagtulong sa kapuwa gamit ang sariling oras, talento o resorses. - Natutukoy ang mga paraan ng pagiging bukas-palad sa kapuwa bilang salamin ng pananampalataya.', 3, '10 (5 days)', NULL),
  ('Values Education', 8, 'G8-077', 'Nakapagsasanay sa pagiging mapagbigay sa pamamagitan ng kusang-loob na pagtulong sa kapuwa gamit ang sariling oras, talento o resorses. - Naipaliliwanag na ang pagiging bukas-palad sa kapuwa bilang salamin ng pananampalataya ay pagtugon sa tungkuling ibahagi ang mga kaloob ng Diyos nang may pagsasaalang-alang sa pangangailangan ng kapuwa.', 3, '10 (5 days)', NULL),
  ('Values Education', 8, 'G8-078', 'Nakapagsasanay sa pagiging mapagbigay sa pamamagitan ng kusang-loob na pagtulong sa kapuwa gamit ang sariling oras, talento o resorses. - Nailalapat ang mga paraan ng pagiging bukas-palad sa kapuwa bilang salamin ng pananampalataya.', 3, '10 (5 days)', NULL),
  ('Values Education', 8, 'G8-079', 'Nakapagsasanay sa paggalang sa buhay sa pamamagitan ng panghihikayat sa kapuwa ng wastong pag-iingat sa mga nanganganib na maubos na hayop at halaman(endangered species). - Nakakikilala ng mga wastong pagtugon ng mga mamamayan sa mga nanganganib na maubos na hayop at halaman (endangered species).', 3, '11 to 12 (10 days)', NULL),
  ('Values Education', 8, 'G8-080', 'Nakapagsasanay sa paggalang sa buhay sa pamamagitan ng panghihikayat sa kapuwa ng wastong pag-iingat sa mga nanganganib na maubos na hayop at halaman(endangered species). - Nahihinuha na ang pagtugon ng mga mamamayan sa pangangalaga sa mga nanganganib na maubos na hayop at halaman (endangered species) ay pagtiyak ng kaligtasan at pagpapanatili ng balanse ng kalikasan.', 3, '11 to 12 (10 days)', NULL),
  ('Values Education', 8, 'G8-081', 'Nakapagsasanay sa paggalang sa buhay sa pamamagitan ng panghihikayat sa kapuwa ng wastong pag-iingat sa mga nanganganib na maubos na hayop at halaman(endangered species). - Naisasakilos ang mga wastong pagtugon ng mamamayan sa mga nanganganib na maubos na hayop at halaman (endangered species).', 3, '11 to 12 (10 days)', NULL),
  ('Values Education', 8, 'G8-082', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng pagpapalaganap ng mga programa na maaaring lahukan ng pamilya na tumutugon sa kapayapaan at kaligtasan ng mamamayan. - Natutukoy ang mga kilos ng pakikilahok ng pamilya sa mga gawaing pangkapayapaan ng bayan.', 3, '13 (5 days)', NULL),
  ('Values Education', 8, 'G8-083', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng pagpapalaganap ng mga programa na maaaring lahukan ng pamilya na tumutugon sa kapayapaan at kaligtasan ng mamamayan. - Naipaliliwanag na ang pakikilahok ng pamilya sa mga gawaing pangkapayapaan ay nakatutulong sa pagpapanatili ng pagtutulungan, pagkakaisa at katiwasayan ng bayan.', 3, '13 (5 days)', NULL),
  ('Values Education', 8, 'G8-084', 'Nakapagsasanay sa pakikiisa sa pamamagitan ng pagpapalaganap ng mga programa na maaaring lahukan ng pamilya na tumutugon sa kapayapaan at kaligtasan ng mamamayan. - Nailalapat ang mga sariling tungkulin sa pakikilahok ng pamilyang kinabibilangan sa mga gawaing pangkapayapaan ng bayan.', 3, '13 (5 days)', NULL)
) AS v(area, grade_level, lc_code, competency_text, term, week, domain)
JOIN procurements.sms_learning_areas a ON lower(btrim(a.name)) = lower(btrim(v.area))
ON CONFLICT (learning_area_id, grade_level, lc_code) DO NOTHING;

/* Verification: after all 22 parts, seeded_entries = 6718. */
SELECT count(*) AS seeded_entries,
       count(DISTINCT learning_area_id) AS learning_areas
FROM procurements.sms_competency_catalogue
WHERE lc_code ~ '^(K|G[0-9]+)-[0-9]{3}$';
