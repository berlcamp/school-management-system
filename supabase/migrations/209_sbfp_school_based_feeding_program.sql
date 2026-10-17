-- ============================================================================
-- 209 — SCHOOL-BASED FEEDING PROGRAM (SBFP)
-- ============================================================================
-- Backs SBFP Forms 1A, 1B, 2, 3, 4, 5 (milk), 5 (consolidated) and 6, 2026
-- issue: the master lists, the summary of beneficiaries at the start and end of
-- feeding, the daily feeding record, the authorized consignees and inspection
-- team, the milk-tolerance list, the consolidated nutritional status and
-- attendance report, and the NFP / milk deliveries.
--
-- ---------------------------------------------------------------------------
-- Three weighings: baseline, midline, endline
-- ---------------------------------------------------------------------------
-- The feeding programme weighs its beneficiaries three times: at the start of
-- feeding (baseline), part-way (midline) and at the end (endline). Learner
-- Health (023, 111, 188) keeps SF8's two readings only, so the programme keeps
-- its own, in sms_sbfp_measurements, one row per beneficiary per period, each
-- with its own date of weighing. The programme row carries the scheduled date
-- of each of the three weighings, which the entry screen offers as the default.
--
-- A baseline or endline already encoded on Learner Health can be COPIED in by
-- the entry screen; one way, on demand, written only when saved (the 132
-- answer-key prefill rule). After that the two records are independent:
-- editing SF8 does not rewrite a weighing the programme has filed, and the
-- SBFP forms print only the programme's own readings. Bands are suggested from
-- the WHO chart by the same code Learner Health uses
-- (lib/utils/nutritionalStatus.ts) and may be overruled.
--
-- 4Ps and IP status are read from sms_students (is_4ps, ip_ethnic_group),
-- never re-asked.
--
-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
--   sms_sbfp_programs       one per school per school year: the header lines,
--                           the feeding focal person, start / end of feeding,
--                           Last Mile School.
--   sms_sbfp_beneficiaries  one per learner per programme: classification and
--                           the Form 1A / 2 / 5 flags. The section is the one
--                           the learner was selected in; the forms group by it.
--   sms_sbfp_measurements   one weighing per beneficiary per period
--                           (baseline / midline / endline): date, weight,
--                           height, BMI-for-age and height-for-age bands.
--   sms_sbfp_feeding_days   the dates food was served. Form 1B's denominator
--                           ("Feeding Days (B)") and Form 3's day columns.
--   sms_sbfp_feeding_records one code per beneficiary per feeding day (Form 3
--                           legend: H, N, M, H+M, ..., A). Present = any code
--                           but A. A record on a date later removed from the
--                           feeding days is ignored at read time, not deleted,
--                           so removing a day is reversible (the 125 rule).
--   sms_sbfp_contacts       Form 4's two lists.
--   sms_sbfp_deliveries     Form 6's delivery lines per component and grade.
--
-- ---------------------------------------------------------------------------
-- The focal person is a designation, not a role (the 121 observers rule)
-- ---------------------------------------------------------------------------
-- The SBFP focal person is usually a teacher. focal_person_id names them on the
-- programme row and sbfp_can_manage admits them beside the school head,
-- assistant school head, admin and school nurse of that school. A section
-- adviser may select beneficiaries and record feeding for their own section
-- only (sbfp_can_record). Only a school-level manager — not the focal person —
-- may change who the focal person is, enforced by a trigger.
--
-- RLS: SELECT is open to authenticated, as sms_learner_health (023) is and as
-- the division office needs to read every school's programme. Writes are scoped
-- to the actor's ACTIVE school (invariants 12-13) through SECURITY DEFINER
-- helpers, so hiding a button is not the permission (the 161 lesson). Super
-- admin is in the full-access branch (094/113).
--
-- CHECK-constrained values (classification, milk tolerance, component, contact
-- kind, feeding code) per 133/153: each carries behaviour in the forms. The
-- lists live in lib/constants/sbfp.ts.
--
-- Nothing existing is touched: seven new tables, four helper functions, two
-- guard triggers. No ALTER of a pre-existing table, no policy replaced, no DML.
-- ============================================================================

SET search_path TO procurements, public;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_programs (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id),
  school_year TEXT NOT NULL,
  -- Header lines as the forms print them. Prefilled from sms_schools by the
  -- app; stored because the division / municipality wording is the school's.
  region TEXT,
  division_name TEXT,
  district TEXT,
  municipality_barangay TEXT,
  focal_person_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  -- Printed name, so a focal person who later leaves still prints on old forms.
  focal_person_name TEXT,
  feeding_start_date DATE,
  feeding_end_date DATE,
  -- Scheduled date of each of the three weighings; the default date of
  -- weighing on the entry screen. Each measurement keeps its own date.
  baseline_weighing_date DATE,
  midline_weighing_date DATE,
  endline_weighing_date DATE,
  is_last_mile_school BOOLEAN,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_sbfp_programs_school_year_key UNIQUE (school_id, school_year),
  CONSTRAINT sms_sbfp_programs_dates_check
    CHECK (feeding_end_date IS NULL OR feeding_start_date IS NULL
           OR feeding_end_date >= feeding_start_date)
);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_beneficiaries (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_programs(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  section_id BIGINT REFERENCES procurements.sms_sections(id) ON DELETE SET NULL,
  classification TEXT NOT NULL DEFAULT 'primary'
    CHECK (classification IN ('primary', 'secondary')),
  is_pregnant BOOLEAN NOT NULL DEFAULT FALSE,
  has_infant BOOLEAN NOT NULL DEFAULT FALSE,
  is_dewormed BOOLEAN NOT NULL DEFAULT FALSE,
  -- NULL = not yet asked; the form prints a blank rather than "No".
  milk_consent BOOLEAN,
  is_previous_beneficiary BOOLEAN NOT NULL DEFAULT FALSE,
  is_pardo BOOLEAN NOT NULL DEFAULT FALSE,
  is_indigent BOOLEAN NOT NULL DEFAULT FALSE,
  milk_tolerance TEXT
    CHECK (milk_tolerance IN ('none', 'intolerant_willing', 'not_allowed')),
  remarks TEXT,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_sbfp_beneficiaries_program_student_key UNIQUE (program_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_sbfp_beneficiaries_section
  ON procurements.sms_sbfp_beneficiaries(section_id);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_measurements (
  id BIGSERIAL PRIMARY KEY,
  beneficiary_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_beneficiaries(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('baseline', 'midline', 'endline')),
  measured_at DATE,
  weight_kg NUMERIC(5,2) CHECK (weight_kg IS NULL OR weight_kg > 0),
  height_cm NUMERIC(5,2) CHECK (height_cm IS NULL OR height_cm > 0),
  -- The bands of 111 / 023, as Learner Health stores them.
  nutritional_status TEXT
    CHECK (nutritional_status IN ('severely_wasted', 'wasted', 'normal', 'overweight', 'obese')),
  height_for_age TEXT
    CHECK (height_for_age IN ('severely_stunted', 'stunted', 'normal', 'tall')),
  remarks TEXT,
  recorded_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_sbfp_measurements_beneficiary_period_key UNIQUE (beneficiary_id, period)
);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_feeding_days (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_programs(id) ON DELETE CASCADE,
  feeding_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_sbfp_feeding_days_program_date_key UNIQUE (program_id, feeding_date)
);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_feeding_records (
  id BIGSERIAL PRIMARY KEY,
  beneficiary_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_beneficiaries(id) ON DELETE CASCADE,
  feeding_date DATE NOT NULL,
  -- H / N / M, either meal with milk, served-twice variants, or A (absent).
  code TEXT NOT NULL CHECK (code ~ '^(A|M2?|[HN]2?(\+M2?)?)$'),
  recorded_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_sbfp_feeding_records_beneficiary_date_key UNIQUE (beneficiary_id, feeding_date)
);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_contacts (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_programs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('consignee', 'inspection')),
  sort_order INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  designation TEXT,
  tel_no TEXT,
  mobile_no TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_sbfp_contacts_program
  ON procurements.sms_sbfp_contacts(program_id);

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_deliveries (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES procurements.sms_sbfp_programs(id) ON DELETE CASCADE,
  component TEXT NOT NULL CHECK (component IN ('nfp', 'milk')),
  grade_level INT NOT NULL CHECK (grade_level BETWEEN -1 AND 12),
  delivered_on DATE,
  packs_new INT NOT NULL DEFAULT 0 CHECK (packs_new >= 0),
  packs_replacement INT NOT NULL DEFAULT 0 CHECK (packs_replacement >= 0),
  packs_rejected INT NOT NULL DEFAULT 0 CHECK (packs_rejected >= 0),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_sbfp_deliveries_program
  ON procurements.sms_sbfp_deliveries(program_id);

DROP TRIGGER IF EXISTS update_sms_sbfp_programs_updated_at ON procurements.sms_sbfp_programs;
CREATE TRIGGER update_sms_sbfp_programs_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sms_sbfp_beneficiaries_updated_at ON procurements.sms_sbfp_beneficiaries;
CREATE TRIGGER update_sms_sbfp_beneficiaries_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_beneficiaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sms_sbfp_measurements_updated_at ON procurements.sms_sbfp_measurements;
CREATE TRIGGER update_sms_sbfp_measurements_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_measurements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sms_sbfp_feeding_records_updated_at ON procurements.sms_sbfp_feeding_records;
CREATE TRIGGER update_sms_sbfp_feeding_records_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_feeding_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sms_sbfp_contacts_updated_at ON procurements.sms_sbfp_contacts;
CREATE TRIGGER update_sms_sbfp_contacts_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sms_sbfp_deliveries_updated_at ON procurements.sms_sbfp_deliveries;
CREATE TRIGGER update_sms_sbfp_deliveries_updated_at
  BEFORE UPDATE ON procurements.sms_sbfp_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Access helpers
-- ---------------------------------------------------------------------------
-- A school-level manager of the school: head, assistant, admin, nurse at their
-- active school, or super admin anywhere. Used for INSERT of a programme (there
-- is no row yet) and for changing the focal person.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_manage_school(p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM procurements.sms_users u
     WHERE u.user_id = auth.uid()
       AND u.is_active
       AND (
         u.type = 'super admin'
         OR (
           u.type IN ('school_head', 'assistant_school_head', 'admin', 'school_nurse')
           AND u.school_id = p_school_id
         )
       )
  );
$$;

-- The above, or the programme's designated focal person while working at that
-- school.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_manage(p_program_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM procurements.sms_sbfp_programs p
      JOIN procurements.sms_users u ON u.user_id = auth.uid()
     WHERE p.id = p_program_id
       AND u.is_active
       AND (
         u.type = 'super admin'
         OR (
           u.school_id = p.school_id
           AND (
             u.type IN ('school_head', 'assistant_school_head', 'admin', 'school_nurse')
             OR u.id = p.focal_person_id
           )
         )
       )
  );
$$;

-- A manager, or the adviser of that section when it belongs to the programme's
-- school.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_record(
  p_program_id BIGINT,
  p_section_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT procurements.sbfp_can_manage(p_program_id)
      OR EXISTS (
        SELECT 1
          FROM procurements.sms_sbfp_programs p
          JOIN procurements.sms_sections sec ON sec.id = p_section_id
          JOIN procurements.sms_users u ON u.user_id = auth.uid()
         WHERE p.id = p_program_id
           AND u.is_active
           AND u.school_id = p.school_id
           AND sec.school_id = p.school_id
           AND sec.section_adviser_id = u.id
      );
$$;

-- Measurements and feeding records carry no programme or section of their own.
CREATE OR REPLACE FUNCTION procurements.sbfp_can_record_beneficiary(p_beneficiary_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM procurements.sms_sbfp_beneficiaries b
     WHERE b.id = p_beneficiary_id
       AND procurements.sbfp_can_record(b.program_id, b.section_id)
  );
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_can_manage_school(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_can_manage(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_can_record(BIGINT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.sbfp_can_record_beneficiary(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_manage_school(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_manage(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_record(BIGINT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sbfp_can_record_beneficiary(BIGINT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guards
-- ---------------------------------------------------------------------------
-- A programme never moves school, and only a school-level manager (not the
-- focal person themselves) may change who the focal person is.
CREATE OR REPLACE FUNCTION procurements.sbfp_guard_program_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'An SBFP programme cannot be moved to another school.';
  END IF;
  IF NEW.school_year IS DISTINCT FROM OLD.school_year THEN
    RAISE EXCEPTION 'An SBFP programme cannot be moved to another school year.';
  END IF;
  IF NEW.focal_person_id IS DISTINCT FROM OLD.focal_person_id
     AND auth.uid() IS NOT NULL
     AND NOT procurements.sbfp_can_manage_school(NEW.school_id) THEN
    RAISE EXCEPTION 'Only the school head, assistant school head, admin or school nurse may change the feeding focal person.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sbfp_guard_program_update ON procurements.sms_sbfp_programs;
CREATE TRIGGER sbfp_guard_program_update
  BEFORE UPDATE ON procurements.sms_sbfp_programs
  FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_guard_program_update();

-- A beneficiary stays in its programme, and a feeding record stays with its
-- beneficiary; otherwise an adviser could re-point a row past the policy that
-- admitted it.
CREATE OR REPLACE FUNCTION procurements.sbfp_guard_beneficiary_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF NEW.program_id IS DISTINCT FROM OLD.program_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id THEN
    RAISE EXCEPTION 'A beneficiary cannot be moved to another programme or learner.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sbfp_guard_beneficiary_update ON procurements.sms_sbfp_beneficiaries;
CREATE TRIGGER sbfp_guard_beneficiary_update
  BEFORE UPDATE ON procurements.sms_sbfp_beneficiaries
  FOR EACH ROW EXECUTE FUNCTION procurements.sbfp_guard_beneficiary_update();

REVOKE ALL ON FUNCTION procurements.sbfp_guard_program_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_guard_beneficiary_update() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------
ALTER TABLE procurements.sms_sbfp_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_sbfp_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_sbfp_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_sbfp_feeding_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_sbfp_feeding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_sbfp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_sbfp_deliveries ENABLE ROW LEVEL SECURITY;

-- Programmes
DROP POLICY IF EXISTS "sbfp_programs_select" ON procurements.sms_sbfp_programs;
CREATE POLICY "sbfp_programs_select" ON procurements.sms_sbfp_programs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_programs_insert" ON procurements.sms_sbfp_programs;
CREATE POLICY "sbfp_programs_insert" ON procurements.sms_sbfp_programs
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_can_manage_school(school_id));
DROP POLICY IF EXISTS "sbfp_programs_update" ON procurements.sms_sbfp_programs;
CREATE POLICY "sbfp_programs_update" ON procurements.sms_sbfp_programs
  FOR UPDATE TO authenticated
  USING (procurements.sbfp_can_manage(id))
  WITH CHECK (procurements.sbfp_can_manage(id));
DROP POLICY IF EXISTS "sbfp_programs_delete" ON procurements.sms_sbfp_programs;
CREATE POLICY "sbfp_programs_delete" ON procurements.sms_sbfp_programs
  FOR DELETE TO authenticated
  USING (procurements.sbfp_can_manage_school(school_id));

-- Beneficiaries
DROP POLICY IF EXISTS "sbfp_beneficiaries_select" ON procurements.sms_sbfp_beneficiaries;
CREATE POLICY "sbfp_beneficiaries_select" ON procurements.sms_sbfp_beneficiaries
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_beneficiaries_insert" ON procurements.sms_sbfp_beneficiaries;
CREATE POLICY "sbfp_beneficiaries_insert" ON procurements.sms_sbfp_beneficiaries
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_can_record(program_id, section_id));
DROP POLICY IF EXISTS "sbfp_beneficiaries_update" ON procurements.sms_sbfp_beneficiaries;
CREATE POLICY "sbfp_beneficiaries_update" ON procurements.sms_sbfp_beneficiaries
  FOR UPDATE TO authenticated
  USING (procurements.sbfp_can_record(program_id, section_id))
  WITH CHECK (procurements.sbfp_can_record(program_id, section_id));
DROP POLICY IF EXISTS "sbfp_beneficiaries_delete" ON procurements.sms_sbfp_beneficiaries;
CREATE POLICY "sbfp_beneficiaries_delete" ON procurements.sms_sbfp_beneficiaries
  FOR DELETE TO authenticated
  USING (procurements.sbfp_can_record(program_id, section_id));

-- Measurements (whoever may encode the beneficiary's section)
DROP POLICY IF EXISTS "sbfp_measurements_select" ON procurements.sms_sbfp_measurements;
CREATE POLICY "sbfp_measurements_select" ON procurements.sms_sbfp_measurements
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_measurements_write" ON procurements.sms_sbfp_measurements;
CREATE POLICY "sbfp_measurements_write" ON procurements.sms_sbfp_measurements
  FOR ALL TO authenticated
  USING (procurements.sbfp_can_record_beneficiary(beneficiary_id))
  WITH CHECK (procurements.sbfp_can_record_beneficiary(beneficiary_id));

-- Feeding days (programme-wide calendar: managers only)
DROP POLICY IF EXISTS "sbfp_feeding_days_select" ON procurements.sms_sbfp_feeding_days;
CREATE POLICY "sbfp_feeding_days_select" ON procurements.sms_sbfp_feeding_days
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_feeding_days_insert" ON procurements.sms_sbfp_feeding_days;
CREATE POLICY "sbfp_feeding_days_insert" ON procurements.sms_sbfp_feeding_days
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_can_manage(program_id));
DROP POLICY IF EXISTS "sbfp_feeding_days_delete" ON procurements.sms_sbfp_feeding_days;
CREATE POLICY "sbfp_feeding_days_delete" ON procurements.sms_sbfp_feeding_days
  FOR DELETE TO authenticated
  USING (procurements.sbfp_can_manage(program_id));

-- Feeding records
DROP POLICY IF EXISTS "sbfp_feeding_records_select" ON procurements.sms_sbfp_feeding_records;
CREATE POLICY "sbfp_feeding_records_select" ON procurements.sms_sbfp_feeding_records
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_feeding_records_insert" ON procurements.sms_sbfp_feeding_records;
CREATE POLICY "sbfp_feeding_records_insert" ON procurements.sms_sbfp_feeding_records
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sbfp_can_record_beneficiary(beneficiary_id));
DROP POLICY IF EXISTS "sbfp_feeding_records_update" ON procurements.sms_sbfp_feeding_records;
CREATE POLICY "sbfp_feeding_records_update" ON procurements.sms_sbfp_feeding_records
  FOR UPDATE TO authenticated
  USING (procurements.sbfp_can_record_beneficiary(beneficiary_id))
  WITH CHECK (procurements.sbfp_can_record_beneficiary(beneficiary_id));
DROP POLICY IF EXISTS "sbfp_feeding_records_delete" ON procurements.sms_sbfp_feeding_records;
CREATE POLICY "sbfp_feeding_records_delete" ON procurements.sms_sbfp_feeding_records
  FOR DELETE TO authenticated
  USING (procurements.sbfp_can_record_beneficiary(beneficiary_id));

-- Contacts and deliveries (managers only)
DROP POLICY IF EXISTS "sbfp_contacts_select" ON procurements.sms_sbfp_contacts;
CREATE POLICY "sbfp_contacts_select" ON procurements.sms_sbfp_contacts
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_contacts_write" ON procurements.sms_sbfp_contacts;
CREATE POLICY "sbfp_contacts_write" ON procurements.sms_sbfp_contacts
  FOR ALL TO authenticated
  USING (procurements.sbfp_can_manage(program_id))
  WITH CHECK (procurements.sbfp_can_manage(program_id));

DROP POLICY IF EXISTS "sbfp_deliveries_select" ON procurements.sms_sbfp_deliveries;
CREATE POLICY "sbfp_deliveries_select" ON procurements.sms_sbfp_deliveries
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sbfp_deliveries_write" ON procurements.sms_sbfp_deliveries;
CREATE POLICY "sbfp_deliveries_write" ON procurements.sms_sbfp_deliveries
  FOR ALL TO authenticated
  USING (procurements.sbfp_can_manage(program_id))
  WITH CHECK (procurements.sbfp_can_manage(program_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  procurements.sms_sbfp_programs,
  procurements.sms_sbfp_beneficiaries,
  procurements.sms_sbfp_measurements,
  procurements.sms_sbfp_feeding_days,
  procurements.sms_sbfp_feeding_records,
  procurements.sms_sbfp_contacts,
  procurements.sms_sbfp_deliveries
TO authenticated;
GRANT USAGE, SELECT ON
  SEQUENCE procurements.sms_sbfp_programs_id_seq,
  procurements.sms_sbfp_beneficiaries_id_seq,
  procurements.sms_sbfp_measurements_id_seq,
  procurements.sms_sbfp_feeding_days_id_seq,
  procurements.sms_sbfp_feeding_records_id_seq,
  procurements.sms_sbfp_contacts_id_seq,
  procurements.sms_sbfp_deliveries_id_seq
TO authenticated;

COMMENT ON TABLE procurements.sms_sbfp_programs IS
  'School-Based Feeding Program, one per school per school year (migration 209). Header lines, focal person, feeding dates.';
COMMENT ON TABLE procurements.sms_sbfp_beneficiaries IS
  'SBFP beneficiaries (Form 1A). Their three weighings are in sms_sbfp_measurements.';
COMMENT ON TABLE procurements.sms_sbfp_measurements IS
  'SBFP weighings: baseline, midline, endline per beneficiary, each with its own date. Independent of sms_learner_health once copied.';
COMMENT ON TABLE procurements.sms_sbfp_feeding_records IS
  'SBFP Form 3 daily feeding codes. Present = any code but A. Records off the feeding days are ignored at read time.';

-- Verification: the Supabase SQL editor shows only this last result.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'procurements'
   AND c.relname LIKE 'sms_sbfp_%'
   AND c.relkind = 'r'
 ORDER BY c.relname;
