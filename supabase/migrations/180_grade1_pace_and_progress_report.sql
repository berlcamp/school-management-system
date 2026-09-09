-- ============================================================================
-- GRADE 1 — PACE FORM + LEARNER'S PROGRESS REPORT CARD
-- ============================================================================
-- Grade 1 does not report numeric grades. The issued SDO Bayugan City workbook
-- gives it two documents the rest of the grades have no equivalent of:
--
--   1. PERFORMANCE AND COMPETENCY EVALUATION (PACE) FORM — five pages, one per
--      learning area, rating every MATATAG learning competency A / B / C / D /
--      E (Advancing, Benchmarking, Connecting, Developing, Emerging) per term;
--   2. LEARNER'S PROGRESS REPORT CARD — the parent-facing card, which carries
--      NO grades at all: three term blocks of narrative ("What Your Child Can
--      Do / Mga Nagagawa" and "What Your Child Is Learning To Improve / Dapat
--      Linangin"), the attendance record, and the transfer certificates. It
--      says in as many words that the competency detail "is attached in the
--      succeeding pages" — those pages being the PACE form.
--
-- THIS IS NOT THE KINDERGARTEN PROGRESS REPORT (172) AND NOT THE ECCD
-- CHECKLIST (047/059). The three instruments are distinct and a school files
-- whichever its grade level uses:
--
--   ECCD checklist  | Kinder Progress (172)  | Grade 1 PACE (here)
--   ----------------|------------------------|---------------------------
--   7 domains       | 4 curriculum domains   | 5 LEARNING AREAS
--   0/1 checkbox    | BG / DV / CO           | A / B / C / D / E
--   2 semesters     | 3 terms                | 3 terms
--   scored vs norm  | rating IS the report   | rating IS the report
--
-- Widening 172's tables would have meant widening its rating CHECK from three
-- letters to five and re-interpreting every Kindergarten row already encoded,
-- which is the same trap 172 itself declined to walk into with the ECCD tables.
-- So: new tables, nothing existing touched. No ALTER on any pre-existing
-- table, no enum widened, no policy or trigger replaced, no DML outside the
-- seed below.
--
-- STRUCTURE, AND WHY `terms` IS AN ARRAY.
-- The two arrangements on the issued form are different and both are real:
--
--   * Reading and Literacy and Language print ONE continuous competency list,
--     and each competency carries the terms it is rated in — "Chant rhymes and
--     poems" is Term 1 only, "Read sentences with appropriate speed, accuracy,
--     and expression" is Term 3 only, most of the middle band is all three.
--     That is why the workbook gives those two areas THREE class-summary
--     sheets each (TERM 1/2/3 READING & LITERACY, ... LANGUAGE);
--   * Mathematics, GMRC and Makabansa group their competencies UNDER a term
--     heading and restart the numbering each time, which is why those areas
--     have a single TERM 1-3 sheet.
--
-- One `terms SMALLINT[]` expresses both: the continuous areas carry whatever
-- subset the form shows, the by-term areas carry exactly one. An empty array
-- means the row is not rated at all, which covers the strand headings AND the
-- numbered group parents ("20. Comprehend stories." owns sub-items a-g and has
-- no rating cells of its own). Deriving rateability from the array rather than
-- from a second boolean keeps one ordered list per area reproducing the
-- printed page exactly — the 172 lesson about strand titles as rows.
--
-- `item_number` is TEXT and is transcribed, never computed: the form prints
-- "22" beside the sub-item "a. oneself and family" rather than beside its
-- parent, and a numbering scheme inferred at print time would quietly correct
-- the issued paper.
--
-- `print_column` records which half of the issued page an item was printed in,
-- per 172. The generator balances the two columns itself rather than obeying
-- it, so a DepEd revision that adds items cannot leave one column short and
-- the other running off the page; the column is kept as provenance of the
-- issued layout, and as the answer if that balancing is ever dropped.
--
-- `rating` is CHECK-constrained (the 133/153 line, not 119/132's free TEXT):
-- the five letters ARE the instrument, they are printed back verbatim, and the
-- form's own legend enumerates exactly these five with their Filipino names.
-- A sixth would be a different form.
--
-- CLEARING A RATING DELETES THE ROW, per 172: an unrated competency prints a
-- blank cell, which is what a form printed mid-term is supposed to look like,
-- and a NULL would have to be excluded at every read.
--
-- TRANSCRIBED VERBATIM, per the 137/154/172 rule. The issued file carries
-- plain typographical errors — "Isolate sounda (consonants and vowels)",
-- "Identify initial sounds ((vowels, consonants...", "Recognize the parts of
-- the book" — and they are seeded exactly as issued so a school comparing the
-- screen to the paper finds the same lines. Fixing one is an UPDATE on one row
-- once the division confirms the intent.
--
-- ATTENDANCE ON THE PRINTED CARD IS NOT STORED. It is sms_attendance resolved
-- through 125's school calendar on exactly the rules the attendance grid, SF2
-- and the report card already use — the 172 rule again.
--
-- RLS = authenticated with app-layer roster scoping, matching 105/119/121/172.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. AREAS — the five learning areas, one printed PACE page each
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_pace_areas (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  -- 'continuous' = one list whose items each carry their own terms (Reading
  -- and Literacy, Language); 'by_term' = items grouped under a term heading
  -- with the numbering restarting (Mathematics, GMRC, Makabansa). Presentation
  -- only: both resolve through the same `terms` array.
  mode TEXT NOT NULL DEFAULT 'continuous'
    CHECK (mode IN ('continuous', 'by_term')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_pace_areas IS
  'Learning areas of the Grade 1 PACE form. Distinct from sms_subjects: these are the five areas the issued form prints, one page each.';
COMMENT ON COLUMN procurements.sms_pace_areas.mode IS
  'How the printed page groups its competencies: continuous list, or grouped under Term 1/2/3 headings.';

DROP TRIGGER IF EXISTS update_sms_pace_areas_updated_at ON procurements.sms_pace_areas;
CREATE TRIGGER update_sms_pace_areas_updated_at
  BEFORE UPDATE ON procurements.sms_pace_areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. COMPETENCIES — rated items, group parents and strand headings, in order
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_pace_competencies (
  id BIGSERIAL PRIMARY KEY,
  area_id BIGINT NOT NULL
    REFERENCES procurements.sms_pace_areas(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  -- As printed ("12", "22"), never computed. NULL on headings and on the
  -- lettered sub-items that inherit their parent's number.
  item_number TEXT,
  description TEXT NOT NULL,
  -- TRUE = a strand title ("Phonics and Word Study (sounds to words)"):
  -- printed across the row, never rated.
  is_heading BOOLEAN NOT NULL DEFAULT FALSE,
  -- The terms this competency is rated in. EMPTY = not rated: a heading, or a
  -- numbered group parent whose lettered sub-items carry the ratings.
  terms SMALLINT[] NOT NULL DEFAULT '{}',
  -- For 'by_term' areas, the term heading the item was printed under. NULL in
  -- a continuous area. Presentation only; `terms` is what governs rating.
  term_group SMALLINT CHECK (term_group IS NULL OR term_group IN (1, 2, 3)),
  -- 1 = left half of the printed page, 2 = right half.
  print_column SMALLINT NOT NULL DEFAULT 1 CHECK (print_column IN (1, 2)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_pace_competencies_terms_valid
    CHECK (terms <@ ARRAY[1, 2, 3]::SMALLINT[]),
  -- A heading is never rated.
  CONSTRAINT sms_pace_competencies_heading_unrated
    CHECK (NOT is_heading OR cardinality(terms) = 0)
);

COMMENT ON COLUMN procurements.sms_pace_competencies.terms IS
  'Terms this competency is rated in. Empty = not rated (strand heading, or a numbered parent whose lettered sub-items carry the ratings).';

CREATE INDEX IF NOT EXISTS idx_pace_competencies_area
  ON procurements.sms_pace_competencies(area_id, sort_order);

DROP TRIGGER IF EXISTS update_sms_pace_competencies_updated_at ON procurements.sms_pace_competencies;
CREATE TRIGGER update_sms_pace_competencies_updated_at
  BEFORE UPDATE ON procurements.sms_pace_competencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. RATINGS — one row per learner per competency per term
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_pace_ratings (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL
    REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  competency_id BIGINT NOT NULL
    REFERENCES procurements.sms_pace_competencies(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL
    REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  term SMALLINT NOT NULL CHECK (term IN (1, 2, 3)),
  -- NULL is not stored: an unrated competency simply has no row.
  rating TEXT NOT NULL CHECK (rating IN ('A', 'B', 'C', 'D', 'E')),
  assessed_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_pace_ratings_uniq
    UNIQUE (student_id, competency_id, section_id, school_year, term)
);

COMMENT ON TABLE procurements.sms_pace_ratings IS
  'Grade 1 PACE ratings: A/B/C/D/E per learning competency per term.';

CREATE INDEX IF NOT EXISTS idx_pace_ratings_scope
  ON procurements.sms_pace_ratings(section_id, school_year, term);
CREATE INDEX IF NOT EXISTS idx_pace_ratings_student
  ON procurements.sms_pace_ratings(student_id, school_year);

DROP TRIGGER IF EXISTS update_sms_pace_ratings_updated_at ON procurements.sms_pace_ratings;
CREATE TRIGGER update_sms_pace_ratings_updated_at
  BEFORE UPDATE ON procurements.sms_pace_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. NARRATIVE — the two blocks the Grade 1 card prints per term
--
-- Its own table rather than columns on the ratings, and NOT 172's
-- sms_kinder_progress_remarks: that form prints one free-text comment per
-- term, this one prints TWO named blocks whose headings are part of the
-- instrument, in English and Filipino, with a parent's signature line under
-- each term. Two columns, so an adviser filling only one still saves.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_grade1_progress_narratives (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL
    REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL
    REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  term SMALLINT NOT NULL CHECK (term IN (1, 2, 3)),
  -- "What Your Child Can Do (Mga Nagagawa)"
  can_do TEXT,
  -- "What Your Child Is Learning To Improve (Dapat Linangin)"
  to_improve TEXT,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_grade1_progress_narratives_uniq
    UNIQUE (student_id, section_id, school_year, term)
);

COMMENT ON TABLE procurements.sms_grade1_progress_narratives IS
  'The two narrative blocks printed per term on the Grade 1 Learner''s Progress Report Card. Grade 1 reports no numeric grades.';

CREATE INDEX IF NOT EXISTS idx_grade1_narratives_scope
  ON procurements.sms_grade1_progress_narratives(section_id, school_year, term);

DROP TRIGGER IF EXISTS update_sms_grade1_progress_narratives_updated_at ON procurements.sms_grade1_progress_narratives;
CREATE TRIGGER update_sms_grade1_progress_narratives_updated_at
  BEFORE UPDATE ON procurements.sms_grade1_progress_narratives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. RLS + GRANTS (roster scoping in the app layer, per 105/119/121/172)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_pace_areas',
    'sms_pace_competencies',
    'sms_pace_ratings',
    'sms_grade1_progress_narratives'
  ] LOOP
    EXECUTE format('ALTER TABLE procurements.%1$s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: select" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: insert" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: update" ON procurements.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: delete" ON procurements.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6. SEED — the issued PACE form's competency lists, transcribed verbatim
--
-- 219 rows: 181 rated competencies, the rest strand headings and numbered
-- group parents. ON CONFLICT DO NOTHING on `code`, so re-applying cannot
-- duplicate an item nor overwrite a description the division has since edited.
-- ----------------------------------------------------------------------------
INSERT INTO procurements.sms_pace_areas (code, name, mode, sort_order)
VALUES
  ('RL', 'Reading and Literacy', 'continuous', 1),
  ('LANG', 'Language', 'continuous', 2),
  ('MATH', 'Mathematics', 'by_term', 3),
  ('GMRC', 'Good Manners and Right Conduct (GMRC)', 'by_term', 4),
  ('MKB', 'Makabansa', 'by_term', 5)
ON CONFLICT (code) DO NOTHING;

-- Reading and Literacy
INSERT INTO procurements.sms_pace_competencies
  (area_id, code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
SELECT ar.id, v.code, v.item_number, v.description, v.is_heading, v.terms, v.term_group, v.print_column, v.sort_order
FROM procurements.sms_pace_areas ar,
  (VALUES
    ('RL-001', NULL, 'Phonological Awareness (oracy for literacy)', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 1),
    ('RL-002', '1', 'Chant rhymes and poems.', FALSE, ARRAY[1]::SMALLINT[], NULL::SMALLINT, 1, 2),
    ('RL-003', '2', 'Segment a two or three syllable word into its syllabic parts.', FALSE, ARRAY[1]::SMALLINT[], NULL::SMALLINT, 1, 3),
    ('RL-004', '3', 'Identify rhyming words in nursery rhymes, poems, and chants.', FALSE, ARRAY[1]::SMALLINT[], NULL::SMALLINT, 1, 4),
    ('RL-005', '4', 'Say two or three words that rhyme.', FALSE, ARRAY[1]::SMALLINT[], NULL::SMALLINT, 1, 5),
    ('RL-006', '5', 'Identify initial sounds ((vowels, consonants, and semi-vowels, if any.)', FALSE, ARRAY[1]::SMALLINT[], NULL::SMALLINT, 1, 6),
    ('RL-007', NULL, 'Phonics and Word Study (sounds to words)', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 7),
    ('RL-008', '6', 'Produce the sound of letters of L1.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 8),
    ('RL-009', '7', 'Identify the letters in L1.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 9),
    ('RL-010', '8', 'Isolate sounda (consonants and vowels) in a word (beginning and/or ending).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 10),
    ('RL-011', '9', 'Substitute individual sounds in simple words to make new words.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 11),
    ('RL-012', '10', 'Sound out words accurately.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 12),
    ('RL-013', NULL, 'Vocabulary and Word Knowledge (words)', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 13),
    ('RL-014', '11', 'Use vocabulary referring to self, family, school, community, and environment.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 14),
    ('RL-015', '12', 'Identify words with different functions (naming and describing words).', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 15),
    ('RL-016', NULL, 'a. words that label persons, places, things, animals, actions, situations, ideas, and emotions', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 16),
    ('RL-017', NULL, 'b. words that describe persons, places, things, animals, actions, situations, ideas, and emotions', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 17),
    ('RL-018', '13', 'Read high-frequency words accurately for meaning.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 18),
    ('RL-019', '14', 'Read content-specific words (Math, Makabansa, and GMRC) accurately for meaning.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 19),
    ('RL-020', '15', 'Write words legibly and correctly.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 20),
    ('RL-021', NULL, 'Book and Print Knowledge (words)', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 21),
    ('RL-022', '16', 'Recognize environmental print (symbols).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 22),
    ('RL-023', '17', 'Recognize the parts of the book (cover page, title page, etc.).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 23),
    ('RL-024', '18', 'Recognize proper eye movement skills in reading: left to right, top to bottom, and return sweep.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 24),
    ('RL-025', NULL, 'Comprehending and Analyzing Texts (discourse)', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 25),
    ('RL-026', '19', 'Read sentences with appropriate speed, accuracy, and expression.', FALSE, ARRAY[3]::SMALLINT[], NULL::SMALLINT, 2, 26),
    ('RL-027', '20', 'Comprehend stories.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 27),
    ('RL-028', NULL, 'a. Note important details in stories (character, setting, and events).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 28),
    ('RL-029', NULL, 'b. Sequence events in stories.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 29),
    ('RL-030', NULL, 'c. Infer the character''s feelings and traits.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 30),
    ('RL-031', NULL, 'd. Predict possible ending.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 31),
    ('RL-032', NULL, 'e. Relate story events to one''s experience.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 32),
    ('RL-033', NULL, 'f. Identify cause and effects of events.', FALSE, ARRAY[2,3]::SMALLINT[], NULL::SMALLINT, 2, 33),
    ('RL-034', NULL, 'g. Identify problem and solution in stories.', FALSE, ARRAY[3]::SMALLINT[], NULL::SMALLINT, 2, 34),
    ('RL-035', '21', 'Comprehend informational text.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 35),
    ('RL-036', NULL, 'a. Note significant details in informational texts (list and describe).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 36),
    ('RL-037', NULL, 'b. Identify problem and solution.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 37),
    ('RL-038', NULL, 'Creating and Composing Texts (discourse)', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 38),
    ('RL-039', NULL, 'Narrate one''s personal experiences.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 39),
    ('RL-040', '22', 'a. oneself and family', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 40),
    ('RL-041', NULL, 'b. school', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 41),
    ('RL-042', NULL, 'c. community', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 42),
    ('RL-043', '23', 'Use own words in retelling myths, legends, fables, and narrative poems.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 43),
    ('RL-044', '24', 'Narrate one''s personal experiences.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 44),
    ('RL-045', NULL, 'a. oneself and family', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 45),
    ('RL-046', NULL, 'b. school', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 46),
    ('RL-047', NULL, 'c. community', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 47),
    ('RL-048', '25', 'Respond creatively to texts (myths, legends, fables, and narrative poems).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 48),
    ('RL-049', NULL, 'LEGEND', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 49)
  ) AS v(code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
WHERE ar.code = 'RL'
ON CONFLICT (code) DO NOTHING;

-- Language
INSERT INTO procurements.sms_pace_competencies
  (area_id, code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
SELECT ar.id, v.code, v.item_number, v.description, v.is_heading, v.terms, v.term_group, v.print_column, v.sort_order
FROM procurements.sms_pace_areas ar,
  (VALUES
    ('LANG-001', NULL, 'Language for Interacting with Others', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 1),
    ('LANG-002', '1', 'Talk about one''s personal experiences.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 2),
    ('LANG-003', NULL, 'a. oneself and family', FALSE, ARRAY[1,2]::SMALLINT[], NULL::SMALLINT, 1, 3),
    ('LANG-004', NULL, 'b. school', FALSE, ARRAY[3]::SMALLINT[], NULL::SMALLINT, 1, 4),
    ('LANG-005', NULL, 'c. community', FALSE, ARRAY[3]::SMALLINT[], NULL::SMALLINT, 1, 5),
    ('LANG-006', '2', 'Participate in classroom interactions using verbal and non-verbal responses.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 6),
    ('LANG-007', NULL, 'a. Respond to teacher’s instructions.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 7),
    ('LANG-008', NULL, 'b. Ask and respond to questions.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 8),
    ('LANG-009', '3', 'Interact purposely and participate in conversations and discussions, in pairs, in groups, or in whole-class discussions.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 9),
    ('LANG-010', NULL, 'a. Make requests.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 10),
    ('LANG-011', NULL, 'b. Offer information.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 11),
    ('LANG-012', NULL, 'c. Communicate needs.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 12),
    ('LANG-013', NULL, 'd. Clarify information.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 13),
    ('LANG-014', NULL, 'e. Seek help.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 14),
    ('LANG-015', NULL, 'f. Take part in or take turns in conversation or discussion.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 15),
    ('LANG-016', '4', 'Use common and socially acceptable expressions (e.g., greetings, leave-taking).', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 16),
    ('LANG-017', NULL, 'a. Use simple and appropriate personal greetings.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 17),
    ('LANG-018', NULL, 'b. Use familiar terms of address.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 18),
    ('LANG-019', NULL, 'c. Greet and respond appropriately to greetings.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 19),
    ('LANG-020', '5', 'Share confidently thoughts, preferences, needs, feelings, and ideas with peers, teachers, and other adults.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 20),
    ('LANG-021', NULL, 'Language for Developing and Expressing Ideas', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 21),
    ('LANG-022', '6', 'Express ideas using a variety of symbols (e.g., drawings, emojis, scribbles).', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 22),
    ('LANG-023', NULL, 'a. oneself and family', FALSE, ARRAY[1,2]::SMALLINT[], NULL::SMALLINT, 1, 23),
    ('LANG-024', NULL, 'b. school', FALSE, ARRAY[3]::SMALLINT[], NULL::SMALLINT, 1, 24),
    ('LANG-025', NULL, 'c. community', FALSE, ARRAY[3]::SMALLINT[], NULL::SMALLINT, 1, 25),
    ('LANG-026', '7', 'Use words to represent ideas and events.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 26),
    ('LANG-027', NULL, 'a. words that represent people, animals and objects, locations (naming words).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 27),
    ('LANG-028', NULL, 'b. words that represent activities and situations (action words)', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 28),
    ('LANG-029', NULL, 'c. words that represent qualities or attributes (describing words)', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 29),
    ('LANG-030', '8', 'Use high-frequency and content-specific words.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 30),
    ('LANG-031', NULL, 'a. oneself and family', FALSE, ARRAY[1,2]::SMALLINT[], NULL::SMALLINT, 1, 31),
    ('LANG-032', NULL, 'b. school', FALSE, ARRAY[3]::SMALLINT[], NULL::SMALLINT, 1, 32),
    ('LANG-033', NULL, 'c. community', FALSE, ARRAY[3]::SMALLINT[], NULL::SMALLINT, 1, 33),
    ('LANG-034', '9', 'Use language to express connections between ideas.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 34),
    ('LANG-035', NULL, 'a. Express compare and contrast.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 35),
    ('LANG-036', NULL, 'b. Express cause and effect.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 36),
    ('LANG-037', NULL, 'c. Use time words to relate ideas.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 1, 37),
    ('LANG-038', '10', 'Participate in and contribute to group oral language activities (e.g., singing, chanting, sabayang bigkas).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 38),
    ('LANG-039', NULL, 'Language for Developing and Expressing Ideas', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 39),
    ('LANG-040', '11', 'Notice the features (e.g., sounds, intonation, signs) of their first language and other languages in familiar contexts.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 40),
    ('LANG-041', '12', 'Recognize how a change in intonation (volume, pitch) and body language can change the meanings of utterances/expressions.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 41),
    ('LANG-042', NULL, 'a. Recognize the difference between statements, questions, commands and exclamations.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 42),
    ('LANG-043', NULL, 'b. Respond to change of tones and cues through facial expressions, gestures and actions', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 43),
    ('LANG-044', '13', 'Recognize how language reflects cultural practices and norms.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 44),
    ('LANG-045', NULL, 'a. Share about the language(s) spoken at home.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 45),
    ('LANG-046', NULL, 'b. Share words and phrases in their language.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 46),
    ('LANG-047', NULL, 'c. Notice how local names of streets, places and landmarks have origins in their language.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 47),
    ('LANG-048', NULL, 'd. Explore local terms for food and their origins.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 48),
    ('LANG-049', NULL, 'Interacting with Texts', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 49),
    ('LANG-050', '14', 'View and listen to a range of texts for enjoyment and interest.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 50),
    ('LANG-051', '15', 'Recognize icons and symbols in various texts found in familiar contexts (e.g., printed and digital texts, books, magazines, environmental print).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 51),
    ('LANG-052', '16', 'Engage with or respond to a range of texts.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 52),
    ('LANG-053', NULL, 'a. View or listen to spoken texts.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 53),
    ('LANG-054', NULL, 'b. Identify a variety of purposes for viewing and listening to texts.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 54),
    ('LANG-055', NULL, 'c. Discuss what is interesting or entertaining in a text.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 55),
    ('LANG-056', NULL, 'd. Express personal preferences.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 56),
    ('LANG-057', '17', 'Give reason/s for choosing books/texts for enjoyment and interest.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 57),
    ('LANG-058', NULL, 'Creating Texts', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 58),
    ('LANG-059', '18', 'Record and report ideas and events using some learnt vocabulary.', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 59),
    ('LANG-060', NULL, 'a. Note and report main points.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 60),
    ('LANG-061', NULL, 'b. Sequence up to key three (3) key events.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 61),
    ('LANG-062', NULL, 'c. Relate ideas or events to one’s experience.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 62),
    ('LANG-063', '19', 'Use own words in retelling information from various texts (e.g., legends, fables, and jokes).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 63),
    ('LANG-064', '20', 'Draw and discuss information or ideas from a range of texts (e.g.,stories, images).', FALSE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 64),
    ('LANG-065', NULL, 'a. Note and describe main points (e.g., main characters and events).', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 65),
    ('LANG-066', NULL, 'b. Sequence up to key three (3) key events.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 66),
    ('LANG-067', NULL, 'c. Infer the character’s feelings and traits.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 67),
    ('LANG-068', NULL, 'd. Predict possible endings.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 68),
    ('LANG-069', NULL, 'e. Relate ideas or events to one’s experience.', FALSE, ARRAY[1,2,3]::SMALLINT[], NULL::SMALLINT, 2, 69),
    ('LANG-070', NULL, 'LEGEND', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 2, 70)
  ) AS v(code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
WHERE ar.code = 'LANG'
ON CONFLICT (code) DO NOTHING;

-- Mathematics
INSERT INTO procurements.sms_pace_competencies
  (area_id, code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
SELECT ar.id, v.code, v.item_number, v.description, v.is_heading, v.terms, v.term_group, v.print_column, v.sort_order
FROM procurements.sms_pace_areas ar,
  (VALUES
    ('MATH-001', NULL, 'Number and Algebra', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 1),
    ('MATH-002', '1', 'Count up to 100 (includes counting up or down from a given number and identifying a number that is 1 more or 1 less than a given number).', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 2),
    ('MATH-003', '2', 'Read and write numerals up to 100.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 3),
    ('MATH-004', '3', 'Recognize and represent numbers up to 100 using a variety of concrete and pictorial models (e.g., number line, block or bar models, and numerals).', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 4),
    ('MATH-005', '4', 'Compare two numbers up to 20.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 5),
    ('MATH-006', '5', 'Order numbers up to 20 from smallest to largest, and vice versa.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 6),
    ('MATH-007', '6', 'Describe the position of objects using ordinal numbers: 1st, 2nd, 3rd, up to 10th.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 7),
    ('MATH-008', '7', 'Compose and decompose numbers up to 10 using concrete materials.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 8),
    ('MATH-009', '8', 'Illustrate addition of numbers with sums up to 20 using a variety of concrete and pictorial models and describes addition as “counting up,” and “putting together.”', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 9),
    ('MATH-010', '9', 'Illustrate by applying the following properties of addition, using sums up to 20:', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 10),
    ('MATH-011', NULL, 'a. the sum of zero and any number is equal to the number', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 11),
    ('MATH-012', NULL, 'b. changing the order of the addends does not change the sum', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 12),
    ('MATH-013', '10', 'Solve problems (given orally or in pictures) involving addition with sums up to 20.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 13),
    ('MATH-014', NULL, 'Measurement and Geometry', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 14),
    ('MATH-015', '11', 'Identify simple 2-dimensional shapes (triangle, rectangle, square) of different size and in different orientation.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 15),
    ('MATH-016', '12', 'Compare and distinguish 2-dimensional shapes according to features such as sides and corners.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 16),
    ('MATH-017', '13', 'Compose and decompose triangles, squares, and rectangles.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 17),
    ('MATH-018', '14', 'Measure the length of an object and the distance between two objects using non-standard units.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 18),
    ('MATH-019', '15', 'Compare lengths and distances using non-standard units.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 19),
    ('MATH-020', '16', 'Solve problems involving lengths and distances using non-standard units.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 20),
    ('MATH-021', NULL, 'Number and Algebra', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 21),
    ('MATH-022', '1', 'Order numbers up to 100 from smallest to largest, and vice versa.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 22),
    ('MATH-023', '2', 'Counts by 2s, 5s and 10s up to 100.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 23),
    ('MATH-024', '3', 'Determine:', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 24),
    ('MATH-025', NULL, 'a. the place value of a digit in a 2-digit number', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 25),
    ('MATH-026', '4', 'b. the value of a digit', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 26),
    ('MATH-027', '5', 'c. the digit of a number, given its place value', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 27),
    ('MATH-028', '6', 'Decompose any 2-digit number into tens and ones.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 28),
    ('MATH-029', '7', 'Add numbers by expressing addends as tens and ones (expanded form).', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 29),
    ('MATH-030', '8', 'Add numbers with sums up to 100 without regrouping, using a variety of concrete and pictorial models for:
a. 2-digit and 1-digit numbers', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 30),
    ('MATH-031', NULL, 'b. 2-digit and 2-digit numbers', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 31),
    ('MATH-032', '9', 'Solve problems (given orally or in pictures) involving addition with sums up to 100 without regrouping.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 32),
    ('MATH-033', '10', 'Illustrate subtraction involving numbers up to 20 using a variety of concrete and pictorial models and describes subtraction as “taking away.”', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 33),
    ('MATH-034', '11', 'Find the missing number in addition or subtraction sentences involving numbers up to 20.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 34),
    ('MATH-035', '12', 'Write an equivalent expression to a given addition or subtraction expression (e.g., 2+3 = 1+4; 10-5 = 6-1).', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 35),
    ('MATH-036', '13', 'Solve subtraction problems (given orally or in pictures) where both numbers are less than 20.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 36),
    ('MATH-037', '14', 'Subtract numbers where both numbers are less than 100 using concrete and pictorial models, without regrouping:
a. 2-digit minus 1-digit numbers', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 37),
    ('MATH-038', NULL, 'b. 2-digit minus 2-digit numbers', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 38),
    ('MATH-039', '15', 'Subtract numbers by expressing minuends and subtrahends as tens and ones (expanded form), without regrouping.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 39),
    ('MATH-040', NULL, 'Data and Probability', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 40),
    ('MATH-041', '16', 'Collect data in one variable through a simple interview.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 41),
    ('MATH-042', '17', 'Present data in a pictograph without a scale.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 42),
    ('MATH-043', '18', 'Interpret a pictograph without a scale.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 43),
    ('MATH-044', '19', 'Organize data in a pictograph without a scale into a table.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 44),
    ('MATH-045', NULL, 'Number and Algebra', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 45),
    ('MATH-046', '1', 'Determine the next term/s in a repeating pattern (patterns could use rhythmic properties, visual elements in the arts, …)', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 46),
    ('MATH-047', '2', 'Create repeating patterns using objects, images, or numbers.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 47),
    ('MATH-048', '3', 'Illustrate 1/2 and 1/4 as parts of a whole.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 48),
    ('MATH-049', '4', 'Compare 1/2 and 1/4 using models.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 49),
    ('MATH-050', '5', 'Count halves and quarters.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 50),
    ('MATH-051', '6', 'Recognize coins (excluding centavo coins) and bills up to ₱100 and their notations.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 51),
    ('MATH-052', '7', 'Determine the value of a number of bills and/or a number of coins (excluding centavo coins) up to ₱100.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 52),
    ('MATH-053', '8', 'Compare different denominations of peso coins (excluding centavo coins) and bills up to ₱100.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 53),
    ('MATH-054', '9', 'Solve 1-step problems (given orally or in pictures) involving addition of money where the sum is up to ₱100, or subtraction of money where both amounts are less than ₱100.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 54),
    ('MATH-055', NULL, 'Measurement and Geometry', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 55),
    ('MATH-056', '10', 'Identify the position of objects moved in half turn or in quarter turn, in clockwise or in counter-clockwise direction, given an initial facing direction.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 56),
    ('MATH-057', '11', 'Read and write time by the hour, half hour, and quarter hour using an analog clock.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 57),
    ('MATH-058', '12', 'Give the days of the week and months of the year in the correct order.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 58),
    ('MATH-059', '13', 'Determine the day and month of the year using a calendar.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 59),
    ('MATH-060', '14', 'Solve problems involving time (hour, half hour, quarter hour, days in a week, and months in a year).', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 60)
  ) AS v(code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
WHERE ar.code = 'MATH'
ON CONFLICT (code) DO NOTHING;

-- Good Manners and Right Conduct (GMRC)
INSERT INTO procurements.sms_pace_competencies
  (area_id, code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
SELECT ar.id, v.code, v.item_number, v.description, v.is_heading, v.terms, v.term_group, v.print_column, v.sort_order
FROM procurements.sms_pace_areas ar,
  (VALUES
    ('GMRC-001', NULL, 'Nililinang na Pagpapahalaga', TRUE, '{}'::SMALLINT[], NULL::SMALLINT, 1, 1),
    ('GMRC-002', '1', 'Tiwala sa Sarili (Self-Confidence)', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 2),
    ('GMRC-003', '2', 'Pagiging Totoo (Sincerity)', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 3),
    ('GMRC-004', '3', 'Tiyaga (Perseverance)', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 4),
    ('GMRC-005', '4', 'Madasalin (Prayerful)', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 5),
    ('GMRC-006', '5', 'Mapagpasalamat (Gratitude)', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 6),
    ('GMRC-007', '6', 'Magalang (Respectful)', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 7),
    ('GMRC-008', '7', 'Kalinisan (Cleanliness)', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 8),
    ('GMRC-009', '1', 'Magalang (Respectful)', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 9),
    ('GMRC-010', '2', 'Responsable (Responsible)', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 10),
    ('GMRC-011', '3', 'Matulungin (Helpful)', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 11),
    ('GMRC-012', '4', 'Matulungin (Helpful)', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 12),
    ('GMRC-013', '5', 'Madasalin (Prayerful)', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 13),
    ('GMRC-014', '6', 'Kalinisan (Cleanliness)', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 14),
    ('GMRC-015', '7', 'Masunurin (Obedient)', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 15),
    ('GMRC-016', '8', 'Tiwala sa Sarili (Self-Confidence)', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 16),
    ('GMRC-017', '9', 'Mapagbigay (Generosity)', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 17),
    ('GMRC-018', '1', 'Magalang (Respectful)', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 18),
    ('GMRC-019', '2', 'Kalinisan (Cleanliness)', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 19),
    ('GMRC-020', '3', 'Mapagmalasakit (Compassion)', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 20),
    ('GMRC-021', '4', 'Mapagbigay (Generosity)', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 21),
    ('GMRC-022', '5', 'Mabuting Mamamayan
(Good Citizenship)', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 22),
    ('GMRC-023', '6', 'Magalang (Respectful)', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 23),
    ('GMRC-024', '7', 'Mapagmalasakit (Compassion)', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 24),
    ('GMRC-025', '8', 'Pagmamahal sa Bayan
(Love of Country)', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 25)
  ) AS v(code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
WHERE ar.code = 'GMRC'
ON CONFLICT (code) DO NOTHING;

-- Makabansa
INSERT INTO procurements.sms_pace_competencies
  (area_id, code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
SELECT ar.id, v.code, v.item_number, v.description, v.is_heading, v.terms, v.term_group, v.print_column, v.sort_order
FROM procurements.sms_pace_areas ar,
  (VALUES
    ('MKB-001', '1', 'Nailalarawan na ang bawat tao ay may iba''t-ibang:', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 1),
    ('MKB-002', NULL, 'a. Katangiang Pisikal', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 2),
    ('MKB-003', NULL, 'b. Pangangailangan', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 3),
    ('MKB-004', '2', 'Naipaliliwanag ang karapatan at tungkulin ng bawat bata.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 4),
    ('MKB-005', '3', 'Napahahalagahan ang indibidwalidad ng bawat tao.', FALSE, ARRAY[1]::SMALLINT[], 1::SMALLINT, 1, 5),
    ('MKB-006', '1', 'Naipaliwanag ang konsepto ng pamilya batay sa bumubuo nito tulad ng two-parent, solo parents, extended family, at iba pa.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 6),
    ('MKB-007', '2', 'Naipaliliwanag ang papel at tungkulin ng mga kasapi ng pamilya.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 7),
    ('MKB-008', '3', 'Napahahalagahan ang papel at tungkulin ng mga kasapi ng pamilya.', FALSE, ARRAY[2]::SMALLINT[], 2::SMALLINT, 1, 8),
    ('MKB-009', '1', 'Nailalahad ang mga batayang impormasyon tulad ng pangalan, pinagmulan, laki at lawak, kinaroroonan, at kwento ng sariling paaralan.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 9),
    ('MKB-010', '2', 'Naipaliliwanag ang tungkulin ng mga taong bumubuo sa paaralan tulad ng punong-guro, guro, doctor, nars, dyanitor, mag-aaral at iba pa.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 10),
    ('MKB-011', '3', 'Natutukoy ang kahalagahan ng mga palatandaan at estruktura mula sa tahanan patungo sa paaralan.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 11),
    ('MKB-012', '4', 'Napahahalagahan ang sariling paaralan bilang bahagi ng pamayanan.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 12),
    ('MKB-013', '5', 'Natutukoy ang iba pang kasapi ng pamayanan na umaagapay sa pamilya at paaralan.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 13),
    ('MKB-014', '6', 'Naipaliliwanag ang papel ng mga kasapi ng kinabibilangang pamayanan.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 14),
    ('MKB-015', '7', 'Napahahalagahan ang papel ng mga kasapi ng kinabibilangang pamayanan.', FALSE, ARRAY[3]::SMALLINT[], 3::SMALLINT, 1, 15)
  ) AS v(code, item_number, description, is_heading, terms, term_group, print_column, sort_order)
WHERE ar.code = 'MKB'
ON CONFLICT (code) DO NOTHING;
