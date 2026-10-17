-- ============================================================================
-- 207: Competency catalogue carries term, week and domain
-- ============================================================================
-- 195 modelled a catalogue entry as (learning area, grade, LC code, text),
-- which is what a TOS copies. The MATATAG curriculum guides also place every
-- competency in a term, a week (or range of weeks) and a domain / content
-- strand, and the division wants to filter the catalogue on all three.
--
--   term   SMALLINT 1-3, NULL = not tied to a term (SHS electives, some guides)
--   week   free TEXT, transcribed verbatim: the guides write "1", "2 to 3",
--          "1 (5 days)", "9 - 10", "*" (the 137/154/172 rule). The app parses
--          a week range out of it for filtering; nothing is stored derived.
--   domain free TEXT, verbatim from the guide's Domain / Subdomain / Content
--          column.
--
-- Three nullable ADD COLUMN IF NOT EXISTS. Nothing backfilled, no DML, no
-- policy, trigger or function touched: every existing entry keeps NULLs and
-- every TOS keeps its copy. 208 seeds the MATATAG list against these columns.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_competency_catalogue
  ADD COLUMN IF NOT EXISTS term   SMALLINT,
  ADD COLUMN IF NOT EXISTS week   TEXT,
  ADD COLUMN IF NOT EXISTS domain TEXT;

ALTER TABLE procurements.sms_competency_catalogue
  DROP CONSTRAINT IF EXISTS sms_competency_catalogue_term_check;
ALTER TABLE procurements.sms_competency_catalogue
  ADD CONSTRAINT sms_competency_catalogue_term_check
  CHECK (term IS NULL OR term BETWEEN 1 AND 3);

/* Verification: three columns expected. */
SELECT count(*) AS new_columns
FROM information_schema.columns
WHERE table_schema = 'procurements'
  AND table_name = 'sms_competency_catalogue'
  AND column_name IN ('term', 'week', 'domain');
