-- MAPEH has two components on the subject list, not four.
--
-- 153 modelled `sms_subjects.mapeh_component` on the four letters of the
-- acronym — music / arts / pe / health. That is the curriculum's breakdown,
-- but it is not the subject list a school actually keeps: the schools of this
-- division timetable **Music and Arts** as one subject with one teacher and
-- one grade, and **Physical Education and Health** as another. Offering four
-- tags for two subjects forced a registrar to pick one letter of a pair and
-- leave the other unrepresented, and printed a component row labelled "Music"
-- for a subject that is half Arts.
--
-- So the vocabulary is re-cut to the two:
--
--     music  |  arts   ->  music_arts
--     pe     |  health ->  pe_health
--
-- ---------------------------------------------------------------------------
-- WHAT MOVES WHEN THIS IS APPLIED
-- ---------------------------------------------------------------------------
-- No grade, GPA, general average or promotion decision moves. Not one.
--
-- Everything downstream of this column keys on *whether* a subject is tagged,
-- never on which component it is:
--
--   * students_gpa_for_grade (153 §2) buckets on `mapeh_component IS NOT NULL`
--     and collapses every tagged subject into a single 'mapeh' bucket per
--     quarter. Two tags or four, the bucket is the same one, so the function
--     is not touched by this migration at all.
--   * buildCardSubjectRows (lib/utils/mapeh.ts), behind the report card and
--     SF9, averages the parent row over *whichever* components are tagged and
--     gives the block one entry in the general average.
--   * SF10 and Form 137 never read the column (they still group by regex over
--     the subject name, deliberately — they are archival records).
--
-- What does change is presentation: the component row on a card now prints
-- the subject's own name under a two-line breakdown instead of a four-line
-- one, and the print order runs Music & Arts then PE & Health.
--
-- A school that genuinely kept four separate subjects ends up with two rows
-- tagged `music_arts` and two tagged `pe_health`. That is legal and prints
-- all four under the MAPEH header with the same parent grade as before — the
-- tag is not unique per subject and never was. Merging them into two subjects
-- is a curricular decision for the school, not something a migration should
-- do to encoded grades.
--
-- Count what this rewrites before applying (read-only):
--
--   SELECT mapeh_component, COUNT(*)
--     FROM procurements.sms_subjects
--    WHERE mapeh_component IN ('music', 'arts', 'pe', 'health')
--    GROUP BY mapeh_component ORDER BY 1;
--
-- Backing out is the same UPDATE in reverse, but there is no single correct
-- reverse: `music_arts` cannot know whether it was `music` or `arts`. Since
-- nothing numeric depends on the value, the supported way back is to clear the
-- tags (`SET mapeh_component = NULL`), which 153's header already documents as
-- the full revert of the whole feature.
--
-- One UPDATE confined to rows already carrying one of the four old values, one
-- CHECK constraint replaced, one COMMENT rewritten. No table, column, index,
-- policy or function is dropped, and no untagged subject is read or written.
--
-- ORDER MATTERS. The old constraint comes off BEFORE the UPDATE, not after.
-- A CHECK is enforced per statement, not at commit — putting them in the
-- reading order (fold the values, then swap the vocabulary) fails on the
-- first UPDATE with 23514, because 153's constraint still forbids
-- 'music_arts'. Being inside one transaction does not help: only a FOREIGN KEY
-- can be DEFERRABLE, a CHECK never is. So the table is briefly unconstrained
-- between the DROP and the ADD, which is safe here because the whole file is
-- one transaction and the ADD re-validates every row before it commits.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Take the old vocabulary off
-- ---------------------------------------------------------------------------
-- First, because 153's CHECK forbids 'music_arts' and would reject the fold
-- below the moment the UPDATE ran (see ORDER MATTERS above). Nothing can slip
-- in through the gap: the file is one transaction, and step 3 re-validates
-- every row in the table before it commits.

ALTER TABLE procurements.sms_subjects
  DROP CONSTRAINT IF EXISTS sms_subjects_mapeh_component_check;

-- ---------------------------------------------------------------------------
-- 2. Fold the four old values onto the two
-- ---------------------------------------------------------------------------

UPDATE procurements.sms_subjects
   SET mapeh_component = 'music_arts'
 WHERE mapeh_component IN ('music', 'arts');

UPDATE procurements.sms_subjects
   SET mapeh_component = 'pe_health'
 WHERE mapeh_component IN ('pe', 'health');

-- ---------------------------------------------------------------------------
-- 3. Put the new vocabulary on
-- ---------------------------------------------------------------------------
-- Still CHECK-constrained rather than free app-validated TEXT, for 133's
-- reason and 153's: each value carries application behaviour (it fixes the
-- print order, which is what the acronym spells), and the pair does not move.
--
-- Replaced rather than widened. Leaving the four legal "just in case" would
-- let a future writer store a value the dropdown cannot show and the card
-- cannot label — the exact ambiguity this migration exists to end.
-- lib/constants/mapeh.ts still *reads* the four as aliases, so a card printed
-- against a database that has not had this applied yet groups correctly; the
-- database itself accepts only the two.
--
-- Added without NOT VALID: it is the ADD that proves the fold above caught
-- every tagged row, and on a table this size the full scan costs nothing.

ALTER TABLE procurements.sms_subjects
  ADD CONSTRAINT sms_subjects_mapeh_component_check
  CHECK (mapeh_component IS NULL
         OR mapeh_component IN ('music_arts', 'pe_health'));

COMMENT ON COLUMN procurements.sms_subjects.mapeh_component IS
  'Which MAPEH component this subject is (music_arts/pe_health), or NULL when it is not part of MAPEH. Migration 153 allowed four values (music/arts/pe/health); 155 folded them onto these two, because a school keeps one Music and Arts subject and one Physical Education and Health subject, not four. Nothing numeric reads the value — students_gpa_for_grade and the report card both key on whether the subject is tagged — so the fold moved no grade or average. Tagged subjects are folded into one computed MAPEH row on the report card and SF9, counting once toward the general average. There is deliberately no MAPEH row in this table: the parent is derived at print time, so no teacher can encode a MAPEH grade contradicting its components.';

-- The partial index from 153 is unchanged: it is declared on the column
-- WHERE mapeh_component IS NOT NULL, which no value in it stops satisfying.
