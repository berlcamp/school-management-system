-- ============================================================================
-- ECCD CHECKLIST TABLES
-- ============================================================================
-- Revised Philippine Early Childhood Development (ECCD) Checklist for
-- Kindergarten students. Assesses child development across 7 domains with
-- competency items rated 1-3 at three periods: BOSY, MOSY, EOSY.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- SMS_ECCD_DOMAINS (Reference Table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_eccd_domains (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_sms_eccd_domains_updated_at
  BEFORE UPDATE ON procurements.sms_eccd_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_eccd_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ECCD domains viewable by authenticated"
  ON procurements.sms_eccd_domains FOR SELECT
  USING (auth.role() = 'authenticated');

COMMENT ON TABLE procurements.sms_eccd_domains IS 'ECCD Checklist development domains (Gross Motor, Fine Motor, etc.)';

-- ============================================================================
-- SMS_ECCD_COMPETENCIES (Reference Table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_eccd_competencies (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES procurements.sms_eccd_domains(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eccd_competencies_domain
  ON procurements.sms_eccd_competencies(domain_id);

CREATE TRIGGER update_sms_eccd_competencies_updated_at
  BEFORE UPDATE ON procurements.sms_eccd_competencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_eccd_competencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ECCD competencies viewable by authenticated"
  ON procurements.sms_eccd_competencies FOR SELECT
  USING (auth.role() = 'authenticated');

COMMENT ON TABLE procurements.sms_eccd_competencies IS 'Individual competency items under each ECCD domain';

-- ============================================================================
-- SMS_ECCD_ASSESSMENTS (Data Table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_eccd_assessments (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  competency_id BIGINT NOT NULL REFERENCES procurements.sms_eccd_competencies(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('BOSY', 'MOSY', 'EOSY')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 3),
  assessed_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  school_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, competency_id, section_id, school_year, period)
);

CREATE INDEX IF NOT EXISTS idx_eccd_assessments_student ON procurements.sms_eccd_assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_eccd_assessments_section ON procurements.sms_eccd_assessments(section_id);
CREATE INDEX IF NOT EXISTS idx_eccd_assessments_school_year ON procurements.sms_eccd_assessments(school_year);
CREATE INDEX IF NOT EXISTS idx_eccd_assessments_period ON procurements.sms_eccd_assessments(period);
CREATE INDEX IF NOT EXISTS idx_eccd_assessments_school_id ON procurements.sms_eccd_assessments(school_id);

CREATE TRIGGER update_sms_eccd_assessments_updated_at
  BEFORE UPDATE ON procurements.sms_eccd_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_eccd_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ECCD assessments viewable by authenticated"
  ON procurements.sms_eccd_assessments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "ECCD assessments insertable by authenticated"
  ON procurements.sms_eccd_assessments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "ECCD assessments updatable by authenticated"
  ON procurements.sms_eccd_assessments FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "ECCD assessments deletable by authenticated"
  ON procurements.sms_eccd_assessments FOR DELETE
  USING (auth.role() = 'authenticated');

COMMENT ON TABLE procurements.sms_eccd_assessments IS 'Student ECCD assessment ratings per competency per period (BOSY/MOSY/EOSY)';

-- ============================================================================
-- SEED DATA: ECCD DOMAINS
-- ============================================================================
INSERT INTO procurements.sms_eccd_domains (code, name, description, sort_order) VALUES
  ('GM',  'Gross Motor Skills',    'Large muscle movements such as running, jumping, balancing, and climbing', 1),
  ('FM',  'Fine Motor Skills',     'Small muscle control such as drawing, cutting, writing, and buttoning', 2),
  ('SH',  'Self-Help / Adaptive',  'Daily living skills such as eating, dressing, toileting, and hygiene', 3),
  ('RL',  'Receptive Language',    'Understanding spoken language such as following directions and identifying objects', 4),
  ('EL',  'Expressive Language',   'Using spoken language such as naming, describing, and asking questions', 5),
  ('COG', 'Cognitive',             'Thinking skills such as sorting, counting, problem-solving, and memory', 6),
  ('SE',  'Socio-Emotional',       'Social skills and emotional regulation such as sharing, cooperation, and expressing feelings', 7)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SEED DATA: ECCD COMPETENCIES
-- ============================================================================

-- Gross Motor Skills
INSERT INTO procurements.sms_eccd_competencies (domain_id, code, description, sort_order) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 'GM-01', 'Walks on a straight line without losing balance', 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 'GM-02', 'Runs without falling', 2),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 'GM-03', 'Jumps with both feet together', 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 'GM-04', 'Hops on one foot', 4),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 'GM-05', 'Climbs up and down stairs alternating feet', 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 'GM-06', 'Catches a ball with both hands', 6),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 'GM-07', 'Throws a ball overhand towards a target', 7),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'GM'), 'GM-08', 'Kicks a ball forward', 8)
ON CONFLICT (code) DO NOTHING;

-- Fine Motor Skills
INSERT INTO procurements.sms_eccd_competencies (domain_id, code, description, sort_order) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 'FM-01', 'Holds pencil/crayon with proper grip', 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 'FM-02', 'Draws basic shapes (circle, square, triangle)', 2),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 'FM-03', 'Copies letters and numbers', 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 'FM-04', 'Cuts along a straight line with scissors', 4),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 'FM-05', 'Cuts along a curved line with scissors', 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 'FM-06', 'Buttons and unbuttons clothing', 6),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 'FM-07', 'Strings beads or laces through holes', 7),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'FM'), 'FM-08', 'Colors within boundaries', 8)
ON CONFLICT (code) DO NOTHING;

-- Self-Help / Adaptive
INSERT INTO procurements.sms_eccd_competencies (domain_id, code, description, sort_order) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 'SH-01', 'Feeds self using spoon and fork properly', 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 'SH-02', 'Drinks from a cup without spilling', 2),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 'SH-03', 'Puts on and removes clothing independently', 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 'SH-04', 'Uses the toilet independently', 4),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 'SH-05', 'Washes and dries hands properly', 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 'SH-06', 'Brushes teeth with minimal assistance', 6),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SH'), 'SH-07', 'Puts away personal belongings after use', 7)
ON CONFLICT (code) DO NOTHING;

-- Receptive Language
INSERT INTO procurements.sms_eccd_competencies (domain_id, code, description, sort_order) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 'RL-01', 'Follows simple one-step directions', 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 'RL-02', 'Follows two-step directions in sequence', 2),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 'RL-03', 'Identifies common objects when named', 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 'RL-04', 'Points to body parts when asked', 4),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 'RL-05', 'Understands simple questions (who, what, where)', 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 'RL-06', 'Listens to a short story and answers questions about it', 6),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'RL'), 'RL-07', 'Understands basic concepts (big/small, up/down, in/out)', 7)
ON CONFLICT (code) DO NOTHING;

-- Expressive Language
INSERT INTO procurements.sms_eccd_competencies (domain_id, code, description, sort_order) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 'EL-01', 'Says own first and last name', 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 'EL-02', 'Speaks in complete sentences of 4-5 words', 2),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 'EL-03', 'Names common objects and pictures', 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 'EL-04', 'Describes events or experiences in sequence', 4),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 'EL-05', 'Asks questions to seek information', 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 'EL-06', 'Recites simple rhymes or songs', 6),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'EL'), 'EL-07', 'Uses words to express needs and feelings', 7)
ON CONFLICT (code) DO NOTHING;

-- Cognitive
INSERT INTO procurements.sms_eccd_competencies (domain_id, code, description, sort_order) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 'COG-01', 'Sorts objects by color, shape, or size', 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 'COG-02', 'Counts objects from 1 to 10', 2),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 'COG-03', 'Recognizes and names basic colors', 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 'COG-04', 'Recognizes and names basic shapes', 4),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 'COG-05', 'Matches identical objects or pictures', 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 'COG-06', 'Arranges objects in order by size', 6),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 'COG-07', 'Identifies own written first name', 7),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 'COG-08', 'Completes simple puzzles (6-8 pieces)', 8),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'COG'), 'COG-09', 'Understands concept of same and different', 9)
ON CONFLICT (code) DO NOTHING;

-- Socio-Emotional
INSERT INTO procurements.sms_eccd_competencies (domain_id, code, description, sort_order) VALUES
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 'SE-01', 'Separates from parent/caregiver without excessive distress', 1),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 'SE-02', 'Plays cooperatively with other children', 2),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 'SE-03', 'Takes turns and shares materials', 3),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 'SE-04', 'Follows classroom rules and routines', 4),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 'SE-05', 'Expresses emotions appropriately', 5),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 'SE-06', 'Shows empathy towards others', 6),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 'SE-07', 'Respects the rights and belongings of others', 7),
  ((SELECT id FROM procurements.sms_eccd_domains WHERE code = 'SE'), 'SE-08', 'Demonstrates confidence in attempting new tasks', 8)
ON CONFLICT (code) DO NOTHING;
