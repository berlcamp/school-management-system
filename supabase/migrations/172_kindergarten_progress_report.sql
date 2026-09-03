-- ============================================================================
-- KINDERGARTEN PROGRESS REPORT
-- ============================================================================
-- The SDO Bayugan City "Kindergarten Progress Report" — the card an adviser
-- hands the parent, reporting the child's level of attainment on each
-- Kindergarten Curriculum Guide competency every ten (10) weeks (per TERM),
-- on a three-point scale: BG (Beginning), DV (Developing), CO (Consistent).
--
-- THIS IS NOT THE ECCD CHECKLIST (047 / 059) AND DOES NOT REPLACE IT.
-- The two instruments answer different questions and the schools file both:
--
--   ECCD checklist        | Kindergarten Progress Report
--   ----------------------|-----------------------------------------------
--   7 development domains | 4 curriculum domains (I-IV)
--   0/1 checkbox per item | BG / DV / CO per item
--   2 periods (1st/2nd    | 3 terms (T1/T2/T3), the MATATAG ten-week
--   semester)             | reporting cycle the printed form asks for
--   raw -> scale score,   | no scoring at all; the rating IS the report
--   national norm-ref.    |
--
-- Reusing sms_eccd_* would have meant widening its rating CHECK from (0,1) to
-- a lettered scale and its period CHECK to carry terms, which would silently
-- re-interpret every ECCD row already encoded. So: separate tables, nothing
-- existing touched.
--
-- STRUCTURE. The printed form is a two-column grid: domains I-III run down the
-- left, domain IV (Language, Literacy and Communication) down the right,
-- because IV alone is longer than the other three together. `print_column`
-- carries that arrangement as data so the layout survives a domain being added.
--
-- Domain IV is not a flat list — it is organised into strands (Listening and
-- Viewing, Sight Word Recognition, Speaking, Reading, Writing) and Reading
-- into sub-strands (Phonological/Phonemic Awareness, Letter Knowledge, Letter
-- Sound Relationship, Comprehension, Concepts of Print). Those strand titles
-- are rows on the issued form, printed in the competency column with no rating
-- cells, so they are stored as rows carrying `is_heading` rather than as a
-- separate grouping table: one ordered list reproduces the printed page
-- exactly, and a DepEd revision that promotes or demotes a strand is a row
-- edit, not a schema change.
--
-- TRANSCRIBED VERBATIM. Two items in the issued form are, on their face,
-- typographical errors: "Recognizes non-doable words..." (for "decodable"),
-- and "Matches letters and their corresponding sounds" appearing TWICE under
-- Letter Sound Relationship. Both are kept exactly as issued, per the 137/154
-- rule that a figure transcribed from a DepEd form is printed back verbatim —
-- a school comparing the screen to the paper must find the same lines. Fixing
-- either is an UPDATE on one row once the division confirms the intent.
--
-- RLS = authenticated with app-layer roster scoping, matching 105 / 119 / 121.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. DOMAINS — the four developmental domains of the printed form
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_kinder_progress_domains (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  -- Roman numeral as printed ("I.", "II."); kept separate from sort_order so a
  -- domain can be re-ordered without renumbering the form.
  numeral TEXT NOT NULL,
  name TEXT NOT NULL,
  -- 1 = left half of the printed grid, 2 = right half.
  print_column SMALLINT NOT NULL DEFAULT 1 CHECK (print_column IN (1, 2)),
  -- The form numbers the items of domains I and II (1., 2., ...) and leaves
  -- III and IV unnumbered. Reproduced rather than inferred.
  numbered_items BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_kinder_progress_domains IS
  'Developmental domains of the Kindergarten Progress Report (I-IV). Distinct from sms_eccd_domains, which belongs to the ECCD checklist.';
COMMENT ON COLUMN procurements.sms_kinder_progress_domains.print_column IS
  'Which half of the printed two-column competency grid the domain occupies.';

CREATE TRIGGER update_sms_kinder_progress_domains_updated_at
  BEFORE UPDATE ON procurements.sms_kinder_progress_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. COMPETENCIES — the rated items, plus the strand headings printed among them
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_kinder_progress_competencies (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL
    REFERENCES procurements.sms_kinder_progress_domains(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  -- TRUE = a strand title ("Reading", "Letter Knowledge"): printed across the
  -- row with no rating cells, never rated, never counted.
  is_heading BOOLEAN NOT NULL DEFAULT FALSE,
  -- 0 = strand, 1 = sub-strand. Indents the printed line; ignored on items.
  indent_level SMALLINT NOT NULL DEFAULT 0 CHECK (indent_level BETWEEN 0 AND 2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN procurements.sms_kinder_progress_competencies.is_heading IS
  'A strand title row of the printed form (no rating cells). Advisers cannot rate it and the entry grid skips it.';

CREATE INDEX IF NOT EXISTS idx_kinder_progress_competencies_domain
  ON procurements.sms_kinder_progress_competencies(domain_id, sort_order);

CREATE TRIGGER update_sms_kinder_progress_competencies_updated_at
  BEFORE UPDATE ON procurements.sms_kinder_progress_competencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. RATINGS — one row per learner per competency per term
--
-- CHECK-constrained rather than free TEXT (the 133/153 line rather than the
-- 119/132 one): the three letters are the instrument itself, they are printed
-- back as the report, and the rating-scale legend on page 2 of the form
-- enumerates exactly these three. A fourth would be a different form.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_kinder_progress_ratings (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL
    REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  competency_id BIGINT NOT NULL
    REFERENCES procurements.sms_kinder_progress_competencies(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL
    REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  term SMALLINT NOT NULL CHECK (term IN (1, 2, 3)),
  -- NULL is not stored: an unrated competency simply has no row, so clearing a
  -- rating deletes it and the printed cell goes blank.
  rating TEXT NOT NULL CHECK (rating IN ('BG', 'DV', 'CO')),
  assessed_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_kinder_progress_ratings_uniq
    UNIQUE (student_id, competency_id, section_id, school_year, term)
);

COMMENT ON TABLE procurements.sms_kinder_progress_ratings IS
  'Kindergarten Progress Report ratings: BG/DV/CO per competency per term (three ten-week reporting periods).';

CREATE INDEX IF NOT EXISTS idx_kinder_progress_ratings_scope
  ON procurements.sms_kinder_progress_ratings(section_id, school_year, term);
CREATE INDEX IF NOT EXISTS idx_kinder_progress_ratings_student
  ON procurements.sms_kinder_progress_ratings(student_id, school_year);

CREATE TRIGGER update_sms_kinder_progress_ratings_updated_at
  BEFORE UPDATE ON procurements.sms_kinder_progress_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. TEACHER'S COMMENTS / REMARKS — one block per term on the printed form
--
-- Its own table, not a column on the ratings: the remark belongs to the
-- learner's term, not to any one competency, and the form prints a parent's
-- signature line under each of the three.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_kinder_progress_remarks (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL
    REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL
    REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  term SMALLINT NOT NULL CHECK (term IN (1, 2, 3)),
  -- "Provide specific observations, strengths, and suggested interventions"
  remarks TEXT,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_kinder_progress_remarks_uniq
    UNIQUE (student_id, section_id, school_year, term)
);

COMMENT ON TABLE procurements.sms_kinder_progress_remarks IS
  'Adviser comments printed in the TEACHER''S COMMENTS/REMARKS block of the Kindergarten Progress Report, one per term.';

CREATE INDEX IF NOT EXISTS idx_kinder_progress_remarks_scope
  ON procurements.sms_kinder_progress_remarks(section_id, school_year, term);

CREATE TRIGGER update_sms_kinder_progress_remarks_updated_at
  BEFORE UPDATE ON procurements.sms_kinder_progress_remarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. RLS + GRANTS (roster scoping in the app layer, per 105 / 119 / 121)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_kinder_progress_domains',
    'sms_kinder_progress_competencies',
    'sms_kinder_progress_ratings',
    'sms_kinder_progress_remarks'
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
-- 6. SEED — the issued form's competency list, transcribed verbatim
--
-- ON CONFLICT DO NOTHING on `code`, so re-applying the migration cannot
-- duplicate an item nor overwrite a description the division has since edited.
-- ----------------------------------------------------------------------------
INSERT INTO procurements.sms_kinder_progress_domains
  (code, numeral, name, print_column, numbered_items, sort_order)
VALUES
  ('SPM', 'I',   'Sensory Perceptual and Motor Development',        1, TRUE,  1),
  ('SE',  'II',  'Socio-emotional Development',                     1, TRUE,  2),
  ('COG', 'III', 'Cognitive',                                       1, FALSE, 3),
  ('LLC', 'IV',  'Language, Literacy, and Communiaction Development', 2, FALSE, 4)
ON CONFLICT (code) DO NOTHING;

-- Domain I — Sensory Perceptual and Motor Development
INSERT INTO procurements.sms_kinder_progress_competencies
  (domain_id, code, description, is_heading, indent_level, sort_order)
SELECT d.id, v.code, v.description, FALSE, 0, v.sort_order
FROM procurements.sms_kinder_progress_domains d,
  (VALUES
    ('SPM-01', 'Identifies external body parts and their functions', 1),
    ('SPM-02', 'Identifies ways to care for and protect one''s body', 2),
    ('SPM-03', 'Demonstrates gross motor skills (locomotor, non-locomotor)', 3),
    ('SPM-04', 'Moves body parts as directed', 4),
    ('SPM-05', 'Demonstrates fine motor skills (tearing, cutting, rolling, molding with playdough)', 5)
  ) AS v(code, description, sort_order)
WHERE d.code = 'SPM'
ON CONFLICT (code) DO NOTHING;

-- Domain II — Socio-emotional Development
INSERT INTO procurements.sms_kinder_progress_competencies
  (domain_id, code, description, is_heading, indent_level, sort_order)
SELECT d.id, v.code, v.description, FALSE, 0, v.sort_order
FROM procurements.sms_kinder_progress_domains d,
  (VALUES
    ('SE-01', 'Identifies and expresses feelings in appropriate ways', 1),
    ('SE-02', 'Recognizes and respect feelings of others', 2),
    ('SE-03', 'Expresses needs and preferences', 3),
    ('SE-04', 'Behaves appropriately in different situations', 4),
    ('SE-05', 'Participates in classroom routines and activities', 5),
    ('SE-06', 'Follows classroom and school rules', 6),
    ('SE-07', 'Fulfills classroom responsibilities', 7)
  ) AS v(code, description, sort_order)
WHERE d.code = 'SE'
ON CONFLICT (code) DO NOTHING;

-- Domain III — Cognitive (unnumbered on the issued form)
INSERT INTO procurements.sms_kinder_progress_competencies
  (domain_id, code, description, is_heading, indent_level, sort_order)
SELECT d.id, v.code, v.description, FALSE, 0, v.sort_order
FROM procurements.sms_kinder_progress_domains d,
  (VALUES
    ('COG-01', 'Identifies attributes of objects (color, shape, size)', 1),
    ('COG-02', 'Matches objects based on attributes', 2),
    ('COG-03', 'Describes objects based on attributes (shape, color, taste, texture)', 3),
    ('COG-04', 'Classifies objects by a single attribute (color, shape, size)', 4),
    ('COG-05', 'Reclassifies objects according to multiple attributes', 5),
    ('COG-06', 'Arranges objects according to specific attributes', 6),
    ('COG-07', 'Recognizes, extends and create patterns using concrete objects', 7),
    ('COG-08', 'Measures size, length, capacity and mass of objects using non-standards measuring tools', 8),
    ('COG-09', 'Identifies position of objects (in, on, over, under, top, bottom)', 9),
    ('COG-10', 'Compare quantities of objects (more/less)', 10),
    ('COG-11', 'Counts with one-to-one correspondence', 11),
    ('COG-12', 'Recognizes numerals', 12),
    ('COG-13', 'Matches numerals to objects', 13),
    ('COG-14', 'Adds and subtracts using concrete objects', 14),
    ('COG-15', 'Recognizes clock as measure of time (hours and minutes)', 15),
    ('COG-16', 'Shows awareness and care for the natural and physical environment', 16),
    ('COG-17', 'Talks about participation in cultural and religious activities', 17),
    ('COG-18', 'Shows awareness of the importance of caring for the natural and physical environment through simple practices (e.g. sorting trash, helping to clean up)', 18),
    ('COG-19', 'Predicts outcomes in familiar stories read aloud in class', 19),
    ('COG-20', 'Suggests solutions to problems in class activities and stories read aloud in class', 20)
  ) AS v(code, description, sort_order)
WHERE d.code = 'COG'
ON CONFLICT (code) DO NOTHING;

-- Domain IV — Language, Literacy, and Communication Development
-- Strand headings (is_heading) are interleaved with their items in sort order,
-- exactly as they appear down the right-hand column of the printed form.
INSERT INTO procurements.sms_kinder_progress_competencies
  (domain_id, code, description, is_heading, indent_level, sort_order)
SELECT d.id, v.code, v.description, v.is_heading, v.indent_level, v.sort_order
FROM procurements.sms_kinder_progress_domains d,
  (VALUES
    ('LLC-H-LV',   'Listening and Viewing',                                              TRUE,  0,  1),
    ('LLC-LV-01',  'Identifies familiar environmental sound',                            FALSE, 0,  2),
    ('LLC-LV-02',  'Recalls what happens first, middle and end in a story',              FALSE, 0,  3),
    ('LLC-LV-03',  'Retells story in sequence',                                          FALSE, 0,  4),
    ('LLC-LV-04',  'Follows 1-2 step instruction',                                       FALSE, 0,  5),

    ('LLC-H-SW',   'Sight Word Recognition',                                             TRUE,  0,  6),
    ('LLC-SW-01',  'Recognizes non-doable words in and out of context automatically',    FALSE, 0,  7),
    ('LLC-SW-02',  'Recognizes sight words',                                             FALSE, 0,  8),

    ('LLC-H-SP',   'Speaking',                                                           TRUE,  0,  9),
    ('LLC-SP-01',  'Identifies first and last name',                                     FALSE, 0, 10),
    ('LLC-SP-02',  'Identifies classmates, teachers, family member',                     FALSE, 0, 11),
    ('LLC-SP-03',  'Identifies familiar objects at home, in school and in community',    FALSE, 0, 12),
    ('LLC-SP-04',  'Uses polite greetings and courteous expressions in varied situations', FALSE, 0, 13),
    ('LLC-SP-05',  'Retells personal experiences to story events',                       FALSE, 0, 14),
    ('LLC-SP-06',  'Expresses ideas and feelings using phrases and simple sentences',    FALSE, 0, 15),

    ('LLC-H-RD',   'Reading',                                                            TRUE,  0, 16),
    ('LLC-H-PA',   'Phonological/Phonemic Awareness',                                    TRUE,  1, 17),
    ('LLC-PA-01',  'Orally segment sounds (Syllable, Onset and rime, Phoneme by phoneme)', FALSE, 0, 18),

    ('LLC-H-LK',   'Letter Knowledge',                                                   TRUE,  1, 19),
    ('LLC-LK-01',  'Identifies uppercase letters',                                       FALSE, 0, 20),
    ('LLC-LK-02',  'Identifies lowercase letters',                                       FALSE, 0, 21),
    ('LLC-LK-03',  'Matches uppercase and lowercase letters',                            FALSE, 0, 22),

    ('LLC-H-LSR',  'Letter sound Relationship',                                          TRUE,  1, 23),
    ('LLC-LSR-01', 'Matches letters and their corresponding sounds',                     FALSE, 0, 24),
    ('LLC-LSR-02', 'Matches letters and their corresponding sounds',                     FALSE, 0, 25),

    ('LLC-H-CM',   'Comprehension',                                                      TRUE,  1, 26),
    ('LLC-CM-01',  'Uses a variety of strategies to gain meaning of leveled texts',      FALSE, 0, 27),
    ('LLC-CM-02',  'Uses print and illustrations to make meaning',                       FALSE, 0, 28),

    ('LLC-H-CP',   'Concepts of Print',                                                  TRUE,  1, 29),
    ('LLC-CP-01',  'Demonstrates book handling skills',                                  FALSE, 0, 30),
    ('LLC-CP-02',  'Distinguishes between letters, words, and sentences',                FALSE, 0, 31),
    ('LLC-CP-03',  'Demonstrates awareness of print (left to right and top bottom)',     FALSE, 0, 32),

    ('LLC-H-WR',   'Writing',                                                            TRUE,  0, 33),
    ('LLC-WR-01',  'Traces/draws/copies shapes, designs, pictures',                      FALSE, 0, 34),
    ('LLC-WR-02',  'Traces/draws/ writes name. words',                                   FALSE, 0, 35),
    ('LLC-WR-03',  'Writes uppercase and lowercase letters',                             FALSE, 0, 36),
    ('LLC-WR-04',  'Spells sight words',                                                 FALSE, 0, 37),
    ('LLC-WR-05',  'Spells simple words phonetically',                                   FALSE, 0, 38)
  ) AS v(code, description, is_heading, indent_level, sort_order)
WHERE d.code = 'LLC'
ON CONFLICT (code) DO NOTHING;
