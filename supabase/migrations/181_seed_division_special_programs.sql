-- ============================================================================
-- SEED THE DIVISION-WIDE SPECIAL CURRICULAR PROGRAMS
-- ============================================================================
-- Migration 179 shipped sms_special_programs empty, deliberately: the national
-- list is not in this repository and an unverified one is worse than none.
-- This is that list, entered once as division-wide rows (school_id NULL) so
-- every school in the division tags subjects against the same names instead of
-- fifteen schools spelling "Special Program in the Arts" fifteen ways.
--
-- READ THIS BEFORE APPLYING. The programs below are DepEd's recognised Special
-- Curricular Programs as generally published, NOT a transcription of an
-- issuance held in this repository. Before applying, delete any row the
-- division does not actually run and correct any name that differs from the
-- SDO's own wording. Every program is one INSERT block and every strand is one
-- line in a VALUES list, so editing is a delete, not a rewrite.
--
-- NUMBERED 181: 180 is the Grade 1 PACE / progress report migration, authored
-- in parallel with this work. The RLS fix on sms_student_subjects that 179's
-- header calls for is still unwritten and will take the next free number.
--
-- WHAT IS DELIBERATELY NOT HERE
--   * ALS and Madrasah (MEP). Those are CURRICULUM STREAMS, and they already
--     exist as values of sms_subjects.program (133). Adding either as a
--     special program would recreate exactly the conflation 179 exists to
--     prevent, and a subject would end up describable two ways at once.
--   * SNED / SPED. Learner manifestation tagging is migration 119's module and
--     has its own record; it is not a curricular program a subject tags to.
--   * Every strand of SPS and SPTVE. A division's sports and its tech-voc
--     specialisations are local facts, and guessing them would put wrong rows
--     in front of a registrar with the division's authority behind them. Both
--     programs are seeded with NO strands; schools add their own, which is
--     what nullable specialization_id is for.
--
-- IDEMPOTENT AND NON-DESTRUCTIVE, per 172's seed rule. Re-applying inserts
-- nothing and overwrites nothing: a name the division has since edited stays
-- edited, and a program it has retired (is_active = false) stays retired.
-- INSERT ... WHERE NOT EXISTS rather than ON CONFLICT, because 179's uniqueness
-- is a PARTIAL index on upper(code) and inferring one takes both the
-- expression and its WHERE clause; NOT EXISTS says the same thing plainly.
--
-- Nothing but INSERTs into two tables added by 179. No schema change, no
-- policy, no trigger, no UPDATE, no DELETE, and not one school row touched.
-- Backing the whole thing out is:
--   DELETE FROM procurements.sms_special_programs
--    WHERE school_id IS NULL AND code IN ('SPA','SPS','SPFL','STE','SPJ','SPTVE','SSES');
-- which the ON DELETE RESTRICT FKs will refuse the moment a subject or a
-- learner actually references one. That is the intended behaviour.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- 1. THE PROGRAMS
-- ============================================================================
-- specialization_label is what each program calls its second level. It is a UI
-- label only; a program that has no second level keeps the generic default and
-- simply carries no strand rows.
INSERT INTO procurements.sms_special_programs
  (school_id, code, name, specialization_label, description)
SELECT NULL::BIGINT, v.code, v.name, v.label, v.description
  FROM (
    VALUES
      ('SPA',   'Special Program in the Arts',
                'Area of Specialization',
                'Special curricular program in the arts'),
      ('SPS',   'Special Program in Sports',
                'Sport',
                'Special curricular program in sports'),
      ('SPFL',  'Special Program in Foreign Language',
                'Language',
                'Special curricular program in foreign language'),
      ('STE',   'Science, Technology and Engineering Program',
                'Specialization',
                'Science, technology and engineering curriculum program'),
      ('SPJ',   'Special Program in Journalism',
                'Specialization',
                'Special curricular program in journalism'),
      ('SPTVE', 'Special Program in Technical-Vocational Education',
                'Specialization',
                'Special curricular program in technical and vocational education'),
      ('SSES',  'Special Science Elementary School',
                'Specialization',
                'Special science curriculum program for elementary schools')
  ) AS v(code, name, label, description)
 WHERE NOT EXISTS (
   SELECT 1
     FROM procurements.sms_special_programs sp
    WHERE sp.school_id IS NULL
      AND upper(sp.code) = upper(v.code)
 );

-- ============================================================================
-- 2. STRANDS
-- ============================================================================

-- SPA: the six areas of specialisation.
INSERT INTO procurements.sms_special_program_specializations
  (special_program_id, code, name)
SELECT sp.id, v.code, v.name
  FROM procurements.sms_special_programs sp
  CROSS JOIN (
    VALUES
      ('MUS', 'Music'),
      ('DAN', 'Dance'),
      ('THE', 'Theater Arts'),
      ('VIS', 'Visual Arts'),
      ('MED', 'Media Arts'),
      ('CRW', 'Creative Writing')
  ) AS v(code, name)
 WHERE sp.school_id IS NULL
   AND upper(sp.code) = 'SPA'
   AND NOT EXISTS (
     SELECT 1
       FROM procurements.sms_special_program_specializations x
      WHERE x.special_program_id = sp.id
        AND upper(x.code) = upper(v.code)
   );

-- SPFL: the languages DepEd's foreign language program has offered. A division
-- typically runs one or two of these; delete the rest before applying.
INSERT INTO procurements.sms_special_program_specializations
  (special_program_id, code, name)
SELECT sp.id, v.code, v.name
  FROM procurements.sms_special_programs sp
  CROSS JOIN (
    VALUES
      ('SPN', 'Spanish'),
      ('FRE', 'French'),
      ('GER', 'German'),
      ('JPN', 'Japanese'),
      ('KOR', 'Korean'),
      ('CHN', 'Mandarin Chinese')
  ) AS v(code, name)
 WHERE sp.school_id IS NULL
   AND upper(sp.code) = 'SPFL'
   AND NOT EXISTS (
     SELECT 1
       FROM procurements.sms_special_program_specializations x
      WHERE x.special_program_id = sp.id
        AND upper(x.code) = upper(v.code)
   );

-- SPS, SPTVE, STE, SPJ and SSES are seeded with no strands, on purpose. See
-- the header: a division's sports and tech-voc specialisations are local, and
-- STE / SPJ / SSES have no second level at all. A subject simply tags to the
-- program, which is what nullable specialization_id is for.

-- ============================================================================
-- 3. VERIFY
-- ============================================================================
-- One result set, because the Supabase SQL editor shows only the last.
SELECT sp.code,
       sp.name,
       sp.specialization_label,
       sp.is_active,
       count(x.id) AS strands
  FROM procurements.sms_special_programs sp
  LEFT JOIN procurements.sms_special_program_specializations x
    ON x.special_program_id = sp.id
 WHERE sp.school_id IS NULL
 GROUP BY sp.id, sp.code, sp.name, sp.specialization_label, sp.is_active
 ORDER BY sp.code;
