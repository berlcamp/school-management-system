/**
 * School-Based Feeding Program — reads and writes against migration 209's
 * tables, plus the Learner Health readings used to suggest beneficiaries and
 * to prefill a weighing.
 *
 * Every list read pages through PostgREST's 1,000-row cap: a school feeding 300
 * learners for 120 days holds 36,000 feeding records.
 */

import { ENROLLED_LIFECYCLE_STATUSES } from "@/lib/constants/enrollment";
import { TEST_SCHOOL_ID_FILTER } from "@/lib/constants/landing";
import { SBFP_ABSENT_CODE } from "@/lib/constants/sbfp";
import type {
  SbfpClassification,
  SbfpContactKind,
  SbfpDeliveryComponent,
  SbfpFeedbackStatus,
  SbfpMealKind,
  SbfpMilkTolerance,
  SbfpWeighingPeriod,
} from "@/lib/constants/sbfp";
import { supabase } from "@/lib/supabase/client";
import { learnerSexKey } from "@/lib/utils/learnerSex";
import type {
  HeightForAge,
  NutritionalStatus,
} from "@/lib/utils/nutritionalStatus";
import type {
  QualityQuestion,
  SbfpBeneficiaryView,
  SbfpDelivery,
  SbfpMealLine,
  SbfpReading,
  SbfpSchoolOption,
  YesNoAnswers,
} from "@/lib/utils/sbfp";

const PAGE = 1000;
/** Ids per `.in()` filter, so the request URL stays well under limits. */
const ID_CHUNK = 200;

export interface SbfpProgram {
  id: string;
  school_id: string;
  school_year: string;
  region: string | null;
  division_name: string | null;
  district: string | null;
  municipality_barangay: string | null;
  focal_person_id: string | null;
  focal_person_name: string | null;
  feeding_start_date: string | null;
  feeding_end_date: string | null;
  baseline_weighing_date: string | null;
  midline_weighing_date: string | null;
  endline_weighing_date: string | null;
  is_last_mile_school: boolean | null;
}

/** The programme column holding each period's scheduled date of weighing. */
export const WEIGHING_DATE_FIELD: Record<
  SbfpWeighingPeriod,
  "baseline_weighing_date" | "midline_weighing_date" | "endline_weighing_date"
> = {
  baseline: "baseline_weighing_date",
  midline: "midline_weighing_date",
  endline: "endline_weighing_date",
};

export type SbfpProgramInput = Omit<SbfpProgram, "id">;

export interface SbfpContact {
  id: string;
  program_id: string;
  kind: SbfpContactKind;
  sort_order: number;
  name: string;
  designation: string | null;
  tel_no: string | null;
  mobile_no: string | null;
  email: string | null;
}

/** The editable half of a beneficiary row. */
export interface SbfpBeneficiaryFields {
  classification: SbfpClassification;
  is_pregnant: boolean;
  has_infant: boolean;
  is_dewormed: boolean;
  milk_consent: boolean | null;
  is_previous_beneficiary: boolean;
  is_pardo: boolean;
  is_indigent: boolean;
  milk_tolerance: SbfpMilkTolerance | null;
}

export interface SbfpSchoolHeader {
  name: string;
  deped_school_id: string;
  region: string | null;
  district: string | null;
  municipality_city: string | null;
  barangay: string | null;
}

function chunks<T>(items: readonly T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const str = (v: unknown): string | null => (v == null ? null : String(v));

// ---------------------------------------------------------------------------
// School and programme
// ---------------------------------------------------------------------------

export async function fetchSchoolHeader(
  schoolId: string | number,
): Promise<SbfpSchoolHeader> {
  const { data, error } = await supabase
    .from("sms_schools")
    .select("name, school_id, region, district, municipality_city, barangay")
    .eq("id", Number(schoolId))
    .single();
  if (error || !data) throw new Error("School not found");
  return {
    name: data.name,
    deped_school_id: str(data.school_id) ?? "",
    region: data.region ?? null,
    district: data.district ?? null,
    municipality_city: data.municipality_city ?? null,
    barangay: data.barangay ?? null,
  };
}

function normalizeProgram(row: Record<string, unknown>): SbfpProgram {
  return {
    id: String(row.id),
    school_id: String(row.school_id),
    school_year: String(row.school_year),
    region: str(row.region),
    division_name: str(row.division_name),
    district: str(row.district),
    municipality_barangay: str(row.municipality_barangay),
    focal_person_id: str(row.focal_person_id),
    focal_person_name: str(row.focal_person_name),
    feeding_start_date: str(row.feeding_start_date),
    feeding_end_date: str(row.feeding_end_date),
    baseline_weighing_date: str(row.baseline_weighing_date),
    midline_weighing_date: str(row.midline_weighing_date),
    endline_weighing_date: str(row.endline_weighing_date),
    is_last_mile_school:
      row.is_last_mile_school == null ? null : Boolean(row.is_last_mile_school),
  };
}

export async function fetchProgram(
  schoolId: string | number,
  schoolYear: string,
): Promise<SbfpProgram | null> {
  const { data, error } = await supabase
    .from("sms_sbfp_programs")
    .select("*")
    .eq("school_id", Number(schoolId))
    .eq("school_year", schoolYear)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeProgram(data) : null;
}

/** Creates the programme, or saves the header of an existing one. */
export async function saveProgram(
  input: SbfpProgramInput,
  existingId: string | null,
  actorId: string | null,
): Promise<SbfpProgram> {
  const payload = {
    region: input.region || null,
    division_name: input.division_name || null,
    district: input.district || null,
    municipality_barangay: input.municipality_barangay || null,
    focal_person_id: input.focal_person_id ? Number(input.focal_person_id) : null,
    focal_person_name: input.focal_person_name || null,
    feeding_start_date: input.feeding_start_date || null,
    feeding_end_date: input.feeding_end_date || null,
    baseline_weighing_date: input.baseline_weighing_date || null,
    midline_weighing_date: input.midline_weighing_date || null,
    endline_weighing_date: input.endline_weighing_date || null,
    is_last_mile_school: input.is_last_mile_school,
  };

  const query = existingId
    ? supabase
        .from("sms_sbfp_programs")
        .update(payload)
        .eq("id", Number(existingId))
    : supabase.from("sms_sbfp_programs").insert({
        ...payload,
        school_id: Number(input.school_id),
        school_year: input.school_year,
        created_by: actorId ? Number(actorId) : null,
      });

  const { data, error } = await query.select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save programme");
  return normalizeProgram(data);
}

/** Staff of the school, for the focal-person picker. */
export async function fetchSchoolStaff(
  schoolId: string | number,
): Promise<{ id: string; name: string; type: string }[]> {
  const { data, error } = await supabase
    .from("sms_users")
    .select("id, name, type")
    .eq("school_id", Number(schoolId))
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((u) => ({
    id: String(u.id),
    name: String(u.name ?? ""),
    type: String(u.type ?? ""),
  }));
}

// ---------------------------------------------------------------------------
// Sections and rosters
// ---------------------------------------------------------------------------

export interface SbfpSection {
  id: string;
  name: string;
  grade_level: number;
  section_adviser_id: string | null;
}

export async function fetchSchoolSections(
  schoolId: string | number,
  schoolYear: string,
): Promise<SbfpSection[]> {
  const { data, error } = await supabase
    .from("sms_sections")
    .select("id, name, grade_level, section_adviser_id")
    .eq("school_id", Number(schoolId))
    .eq("school_year", schoolYear)
    .eq("is_active", true)
    .order("grade_level")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    id: String(s.id),
    name: String(s.name),
    grade_level: Number(s.grade_level),
    section_adviser_id: str(s.section_adviser_id),
  }));
}

export interface SbfpRosterLearner {
  student_id: string;
  name: string;
  lrn: string | null;
  sex: ReturnType<typeof learnerSexKey>;
  date_of_birth: string | null;
  is_4ps: boolean;
  is_ip: boolean;
  baseline: SbfpReading | null;
}

interface StudentRow {
  id: number | string;
  lrn: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  gender: string | null;
  date_of_birth: string | null;
  is_4ps: boolean | null;
  ip_ethnic_group: string | null;
}

const STUDENT_COLUMNS =
  "id, lrn, first_name, middle_name, last_name, suffix, gender, date_of_birth, is_4ps, ip_ethnic_group";

/** "DELA CRUZ, Juan P." — surname first, middle initial, as the master list. */
export function masterListName(s: StudentRow): string {
  const middle = (s.middle_name ?? "").trim();
  const first = [s.first_name, s.suffix].filter(Boolean).join(" ").trim();
  return `${(s.last_name ?? "").toUpperCase()}, ${first}${middle ? ` ${middle[0]}.` : ""}`.trim();
}

async function fetchStudents(ids: readonly string[]): Promise<Map<string, StudentRow>> {
  const out = new Map<string, StudentRow>();
  for (const part of chunks(ids)) {
    const { data, error } = await supabase
      .from("sms_students")
      .select(STUDENT_COLUMNS)
      .in("id", part.map(Number));
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as StudentRow[]) out.set(String(s.id), s);
  }
  return out;
}

interface HealthRow {
  student_id: number | string;
  section_id: number | string;
  measurement_period: string | null;
  measured_at: string | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  nutritional_status: string | null;
  height_for_age: string | null;
}

function toReading(h: HealthRow): SbfpReading {
  const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));
  return {
    measured_at: h.measured_at ? String(h.measured_at).slice(0, 10) : null,
    height_cm: num(h.height_cm),
    weight_kg: num(h.weight_kg),
    nutritional_status: (h.nutritional_status as NutritionalStatus) ?? null,
    height_for_age: (h.height_for_age as HeightForAge) ?? null,
  };
}

/**
 * Learner Health readings for these learners in the school year, keyed
 * `period:studentId` (period = baseline / endline). A reading in the learner's beneficiary section wins over
 * one taken in another section that year (a learner moved mid-year).
 */
async function fetchReadings(
  studentIds: readonly string[],
  schoolYear: string,
  preferredSection: ReadonlyMap<string, string | null>,
): Promise<Map<string, SbfpReading>> {
  const out = new Map<string, { reading: SbfpReading; preferred: boolean }>();
  for (const part of chunks(studentIds)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("sms_learner_health")
        .select(
          "student_id, section_id, measurement_period, measured_at, height_cm, weight_kg, nutritional_status, height_for_age",
        )
        .eq("school_year", schoolYear)
        .in("student_id", part.map(Number))
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const h of (data ?? []) as HealthRow[]) {
        const sid = String(h.student_id);
        const period = h.measurement_period === "endline" ? "endline" : "baseline";
        const key = `${period}:${sid}`;
        const preferred = preferredSection.get(sid) === String(h.section_id);
        const prev = out.get(key);
        if (!prev || (preferred && !prev.preferred)) {
          out.set(key, { reading: toReading(h), preferred });
        }
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return new Map([...out].map(([k, v]) => [k, v.reading]));
}

/**
 * Learner Health's reading for each learner in one period, keyed by student id
 * — what "Copy from Learner Health" fills a weighing from. Learner Health has
 * no midline, so asking for one returns nothing.
 */
export async function fetchHealthReadings(
  studentIds: readonly string[],
  schoolYear: string,
  period: SbfpWeighingPeriod,
  sectionId: string,
): Promise<Map<string, SbfpReading>> {
  if (period === "midline" || studentIds.length === 0) return new Map();
  const readings = await fetchReadings(
    studentIds,
    schoolYear,
    new Map(studentIds.map((id) => [id, sectionId])),
  );
  const out = new Map<string, SbfpReading>();
  for (const id of studentIds) {
    const r = readings.get(`${period}:${id}`);
    if (r) out.set(id, r);
  }
  return out;
}

/** The enrolled learners of one section, with their Learner Health baseline. */
export async function fetchSectionRoster(
  sectionId: string,
  schoolYear: string,
): Promise<SbfpRosterLearner[]> {
  const { data: enrollments, error } = await supabase
    .from("sms_enrollments")
    .select("student_id")
    .eq("section_id", Number(sectionId))
    .eq("school_year", schoolYear)
    .eq("status", "approved")
    .in("enrollment_status", ENROLLED_LIFECYCLE_STATUSES);
  if (error) throw new Error(error.message);

  const ids = [...new Set((enrollments ?? []).map((e) => String(e.student_id)))];
  if (ids.length === 0) return [];

  const students = await fetchStudents(ids);
  const readings = await fetchReadings(
    ids,
    schoolYear,
    new Map(ids.map((id) => [id, sectionId])),
  );

  return [...students.values()]
    .map((s) => ({
      student_id: String(s.id),
      name: masterListName(s),
      lrn: s.lrn,
      sex: learnerSexKey(s.gender),
      date_of_birth: s.date_of_birth,
      is_4ps: s.is_4ps === true,
      is_ip: Boolean(s.ip_ethnic_group?.trim()),
      baseline: readings.get(`baseline:${s.id}`) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Beneficiaries
// ---------------------------------------------------------------------------

interface BeneficiaryRow extends SbfpBeneficiaryFields {
  id: number | string;
  student_id: number | string;
  section_id: number | string | null;
}

const BENEFICIARY_COLUMNS =
  "id, student_id, section_id, classification, is_pregnant, has_infant, is_dewormed, milk_consent, is_previous_beneficiary, is_pardo, is_indigent, milk_tolerance";

async function fetchBeneficiaryRows(
  programId: string,
  sectionId?: string,
): Promise<BeneficiaryRow[]> {
  const rows: BeneficiaryRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("sms_sbfp_beneficiaries")
      .select(BENEFICIARY_COLUMNS)
      .eq("program_id", Number(programId));
    if (sectionId) query = query.eq("section_id", Number(sectionId));
    const { data, error } = await query.order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as BeneficiaryRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Every beneficiary of the programme (or of one section), joined to the
 * learner, the section and the programme's three weighings. Ordered the way the
 * master lists print: grade level, section, then male before female, then name.
 */
export async function fetchBeneficiaryViews(
  program: Pick<SbfpProgram, "id" | "school_id" | "school_year">,
  sectionId?: string,
): Promise<SbfpBeneficiaryView[]> {
  const rows = await fetchBeneficiaryRows(program.id, sectionId);
  if (rows.length === 0) return [];

  const studentIds = [...new Set(rows.map((r) => String(r.student_id)))];
  const [students, sections] = await Promise.all([
    fetchStudents(studentIds),
    fetchSchoolSections(program.school_id, program.school_year),
  ]);
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const measurements = await fetchMeasurements(rows.map((r) => String(r.id)));
  const reading = (beneficiaryId: string, period: SbfpWeighingPeriod) => {
    const m = measurements.get(`${period}:${beneficiaryId}`);
    return m ? measurementReading(m) : null;
  };

  const sexOrder = { male: 0, female: 1, unspecified: 2 } as const;

  return rows
    .map((r): SbfpBeneficiaryView | null => {
      const s = students.get(String(r.student_id));
      if (!s) return null;
      const section = r.section_id == null ? undefined : sectionById.get(String(r.section_id));
      return {
        id: String(r.id),
        student_id: String(r.student_id),
        section_id: str(r.section_id),
        name: masterListName(s),
        lrn: s.lrn,
        sex: learnerSexKey(s.gender),
        date_of_birth: s.date_of_birth,
        grade_level: section?.grade_level ?? null,
        section_name: section?.name ?? "",
        classification: r.classification,
        is_pregnant: r.is_pregnant,
        has_infant: r.has_infant,
        is_dewormed: r.is_dewormed,
        milk_consent: r.milk_consent,
        is_previous_beneficiary: r.is_previous_beneficiary,
        is_pardo: r.is_pardo,
        is_indigent: r.is_indigent,
        is_4ps: s.is_4ps === true,
        is_ip: Boolean(s.ip_ethnic_group?.trim()),
        milk_tolerance: r.milk_tolerance,
        baseline: reading(String(r.id), "baseline"),
        midline: reading(String(r.id), "midline"),
        endline: reading(String(r.id), "endline"),
      };
    })
    .filter((v): v is SbfpBeneficiaryView => v !== null)
    .sort(
      (a, b) =>
        (a.grade_level ?? 99) - (b.grade_level ?? 99) ||
        a.section_name.localeCompare(b.section_name) ||
        sexOrder[a.sex] - sexOrder[b.sex] ||
        a.name.localeCompare(b.name),
    );
}

/**
 * Learners of the section already beneficiaries under another person's record
 * (migration 210). A teacher cannot read those rows, only that they exist.
 */
export async function fetchTakenStudents(
  programId: string,
  sectionId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("sbfp_taken_students", {
    p_program_id: Number(programId),
    p_section_id: Number(sectionId),
  });
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as (number | string)[]).map(String));
}

/**
 * Writes one section's selection: inserts or updates the ticked learners and
 * removes the unticked ones. Removing a beneficiary also removes their feeding
 * records (ON DELETE CASCADE) — the screen confirms that first.
 */
export async function saveSectionBeneficiaries(params: {
  programId: string;
  sectionId: string;
  selected: Map<string, SbfpBeneficiaryFields>;
  existing: Map<string, string>; // studentId -> beneficiary id
  actorId: string | null;
}): Promise<void> {
  const { programId, sectionId, selected, existing, actorId } = params;

  const upserts = [...selected].map(([studentId, fields]) => ({
    program_id: Number(programId),
    student_id: Number(studentId),
    section_id: Number(sectionId),
    ...fields,
    ...(existing.has(studentId) ? {} : { created_by: actorId ? Number(actorId) : null }),
  }));

  for (const part of chunks(upserts)) {
    const { error } = await supabase
      .from("sms_sbfp_beneficiaries")
      .upsert(part, { onConflict: "program_id,student_id" });
    if (error) throw new Error(error.message);
  }

  const removed = [...existing]
    .filter(([studentId]) => !selected.has(studentId))
    .map(([, id]) => Number(id));
  for (const part of chunks(removed)) {
    const { error } = await supabase
      .from("sms_sbfp_beneficiaries")
      .delete()
      .in("id", part);
    if (error) throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------------
// Weighings (baseline / midline / endline)
// ---------------------------------------------------------------------------

export interface SbfpMeasurement {
  id: string;
  beneficiary_id: string;
  period: SbfpWeighingPeriod;
  measured_at: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  nutritional_status: NutritionalStatus | null;
  height_for_age: HeightForAge | null;
  remarks: string | null;
}

export function measurementReading(m: SbfpMeasurement): SbfpReading {
  return {
    measured_at: m.measured_at,
    height_cm: m.height_cm,
    weight_kg: m.weight_kg,
    nutritional_status: m.nutritional_status,
    height_for_age: m.height_for_age,
  };
}

/** Keyed `period:beneficiaryId`. */
export async function fetchMeasurements(
  beneficiaryIds: readonly string[],
): Promise<Map<string, SbfpMeasurement>> {
  const out = new Map<string, SbfpMeasurement>();
  const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
  for (const part of chunks(beneficiaryIds)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("sms_sbfp_measurements")
        .select(
          "id, beneficiary_id, period, measured_at, weight_kg, height_cm, nutritional_status, height_for_age, remarks",
        )
        .in("beneficiary_id", part.map(Number))
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const m of data ?? []) {
        const row: SbfpMeasurement = {
          id: String(m.id),
          beneficiary_id: String(m.beneficiary_id),
          period: m.period as SbfpWeighingPeriod,
          measured_at: m.measured_at ? String(m.measured_at).slice(0, 10) : null,
          weight_kg: n(m.weight_kg),
          height_cm: n(m.height_cm),
          nutritional_status: (m.nutritional_status as NutritionalStatus) ?? null,
          height_for_age: (m.height_for_age as HeightForAge) ?? null,
          remarks: str(m.remarks),
        };
        out.set(`${row.period}:${row.beneficiary_id}`, row);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

export type SbfpMeasurementInput = Omit<SbfpMeasurement, "id">;

/**
 * Saves one period's weighings. A row holding nothing at all deletes the stored
 * weighing rather than filing an empty one — the form must not claim a
 * weighing that was never taken.
 */
export async function saveMeasurements(
  rows: SbfpMeasurementInput[],
  actorId: string | null,
): Promise<void> {
  const isBlank = (r: SbfpMeasurementInput) =>
    r.weight_kg == null &&
    r.height_cm == null &&
    !r.nutritional_status &&
    !r.height_for_age &&
    !r.remarks?.trim();

  const writes = rows
    .filter((r) => !isBlank(r))
    .map((r) => ({
      beneficiary_id: Number(r.beneficiary_id),
      period: r.period,
      measured_at: r.measured_at || null,
      weight_kg: r.weight_kg,
      height_cm: r.height_cm,
      nutritional_status: r.nutritional_status,
      height_for_age: r.height_for_age,
      remarks: r.remarks?.trim() || null,
      recorded_by: actorId ? Number(actorId) : null,
    }));
  for (const part of chunks(writes)) {
    const { error } = await supabase
      .from("sms_sbfp_measurements")
      .upsert(part, { onConflict: "beneficiary_id,period" });
    if (error) throw new Error(error.message);
  }

  for (const r of rows.filter(isBlank)) {
    const { error } = await supabase
      .from("sms_sbfp_measurements")
      .delete()
      .eq("beneficiary_id", Number(r.beneficiary_id))
      .eq("period", r.period);
    if (error) throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------------
// Feeding days and records
// ---------------------------------------------------------------------------

export async function fetchFeedingDays(programId: string): Promise<string[]> {
  const days: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("sms_sbfp_feeding_days")
      .select("feeding_date")
      .eq("program_id", Number(programId))
      .order("feeding_date")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    days.push(...(data ?? []).map((d) => String(d.feeding_date).slice(0, 10)));
    if (!data || data.length < PAGE) break;
  }
  return days;
}

export async function setFeedingDays(
  programId: string,
  add: readonly string[],
  remove: readonly string[],
): Promise<void> {
  if (add.length > 0) {
    const { error } = await supabase.from("sms_sbfp_feeding_days").upsert(
      add.map((d) => ({ program_id: Number(programId), feeding_date: d })),
      { onConflict: "program_id,feeding_date", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }
  if (remove.length > 0) {
    const { error } = await supabase
      .from("sms_sbfp_feeding_days")
      .delete()
      .eq("program_id", Number(programId))
      .in("feeding_date", [...remove]);
    if (error) throw new Error(error.message);
  }
}

/** beneficiaryId → (date → code), optionally within a date range. */
export async function fetchFeedingRecords(
  beneficiaryIds: readonly string[],
  range?: { from: string; to: string },
): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  for (const part of chunks(beneficiaryIds)) {
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from("sms_sbfp_feeding_records")
        .select("beneficiary_id, feeding_date, code")
        .in("beneficiary_id", part.map(Number));
      if (range) {
        query = query.gte("feeding_date", range.from).lte("feeding_date", range.to);
      }
      const { data, error } = await query.order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        const id = String(r.beneficiary_id);
        if (!out.has(id)) out.set(id, new Map());
        out.get(id)!.set(String(r.feeding_date).slice(0, 10), String(r.code));
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

/**
 * Saves a block of the Form 3 grid. A code writes (upsert); a cell cleared to
 * blank deletes the record, since "not recorded" is not the same as absent.
 */
export async function saveFeedingRecords(
  changes: { beneficiaryId: string; date: string; code: string }[],
  actorId: string | null,
): Promise<void> {
  const writes = changes
    .filter((c) => c.code)
    .map((c) => ({
      beneficiary_id: Number(c.beneficiaryId),
      feeding_date: c.date,
      code: c.code,
      recorded_by: actorId ? Number(actorId) : null,
    }));
  for (const part of chunks(writes, 500)) {
    const { error } = await supabase
      .from("sms_sbfp_feeding_records")
      .upsert(part, { onConflict: "beneficiary_id,feeding_date" });
    if (error) throw new Error(error.message);
  }

  for (const c of changes.filter((c) => !c.code)) {
    const { error } = await supabase
      .from("sms_sbfp_feeding_records")
      .delete()
      .eq("beneficiary_id", Number(c.beneficiaryId))
      .eq("feeding_date", c.date);
    if (error) throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------------
// Contacts (Form 4) and deliveries (Form 6)
// ---------------------------------------------------------------------------

export async function fetchContacts(programId: string): Promise<SbfpContact[]> {
  const { data, error } = await supabase
    .from("sms_sbfp_contacts")
    .select("*")
    .eq("program_id", Number(programId))
    .order("kind")
    .order("sort_order")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: String(c.id),
    program_id: String(c.program_id),
    kind: c.kind as SbfpContactKind,
    sort_order: Number(c.sort_order ?? 0),
    name: String(c.name),
    designation: str(c.designation),
    tel_no: str(c.tel_no),
    mobile_no: str(c.mobile_no),
    email: str(c.email),
  }));
}

export async function saveContact(
  contact: Omit<SbfpContact, "id"> & { id?: string },
): Promise<void> {
  const payload = {
    program_id: Number(contact.program_id),
    kind: contact.kind,
    sort_order: contact.sort_order,
    name: contact.name.trim(),
    designation: contact.designation?.trim() || null,
    tel_no: contact.tel_no?.trim() || null,
    mobile_no: contact.mobile_no?.trim() || null,
    email: contact.email?.trim() || null,
  };
  const { error } = contact.id
    ? await supabase.from("sms_sbfp_contacts").update(payload).eq("id", Number(contact.id))
    : await supabase.from("sms_sbfp_contacts").insert(payload);
  if (error) throw new Error(error.message);
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from("sms_sbfp_contacts").delete().eq("id", Number(id));
  if (error) throw new Error(error.message);
}

export async function fetchDeliveries(programId: string): Promise<SbfpDelivery[]> {
  const { data, error } = await supabase
    .from("sms_sbfp_deliveries")
    .select("*, meals:sms_sbfp_delivery_meals(*)")
    .eq("program_id", Number(programId))
    .order("delivered_on", { ascending: true, nullsFirst: false })
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: String(d.id),
    component: d.component as SbfpDeliveryComponent,
    grade_level: d.grade_level == null ? null : Number(d.grade_level),
    delivered_on: d.delivered_on ? String(d.delivered_on).slice(0, 10) : null,
    packs_new: Number(d.packs_new ?? 0),
    packs_replacement: Number(d.packs_replacement ?? 0),
    packs_rejected: Number(d.packs_rejected ?? 0),
    remarks: str(d.remarks),
    meals: ((d.meals ?? []) as Record<string, unknown>[])
      .sort(
        (a, b) =>
          Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || Number(a.id) - Number(b.id),
      )
      .map((m) => ({
        kind: m.kind as SbfpMealKind,
        quantity: Number(m.quantity ?? 0),
        unit: str(m.unit),
        viand_name: String(m.viand_name ?? ""),
        servings: Number(m.servings ?? 0),
      })),
  }));
}

/**
 * A hot-meals delivery's viand lines are replaced as a set: the new lines are
 * written first and only then are the old ones removed, so a failed save
 * leaves the previous lines in place rather than none.
 */
async function replaceMealLines(deliveryId: number, lines: SbfpMealLine[]): Promise<void> {
  const { data: old, error: readError } = await supabase
    .from("sms_sbfp_delivery_meals")
    .select("id")
    .eq("delivery_id", deliveryId);
  if (readError) throw new Error(readError.message);
  const rows = lines
    .filter((m) => m.viand_name.trim())
    .map((m, i) => ({
      delivery_id: deliveryId,
      kind: m.kind,
      sort_order: i,
      quantity: m.quantity,
      unit: m.unit?.trim() || null,
      viand_name: m.viand_name.trim(),
      servings: m.servings,
    }));
  if (rows.length > 0) {
    const { error } = await supabase.from("sms_sbfp_delivery_meals").insert(rows);
    if (error) throw new Error(error.message);
  }
  const oldIds = (old ?? []).map((r) => Number(r.id));
  if (oldIds.length > 0) {
    const { error } = await supabase.from("sms_sbfp_delivery_meals").delete().in("id", oldIds);
    if (error) throw new Error(error.message);
  }
}

export async function saveDelivery(
  programId: string,
  delivery: Omit<SbfpDelivery, "id"> & { id?: string },
): Promise<void> {
  const isHotMeals = delivery.component === "hot_meals";
  const payload = {
    program_id: Number(programId),
    component: delivery.component,
    grade_level: delivery.grade_level,
    delivered_on: delivery.delivered_on || null,
    // A hot meal is counted in servings on its viand lines, never in packs.
    packs_new: isHotMeals ? 0 : delivery.packs_new,
    packs_replacement: isHotMeals ? 0 : delivery.packs_replacement,
    packs_rejected: isHotMeals ? 0 : delivery.packs_rejected,
    remarks: delivery.remarks?.trim() || null,
  };
  let deliveryId: number;
  if (delivery.id) {
    deliveryId = Number(delivery.id);
    // Lines go first when leaving hot meals: the database refuses to change
    // the component of a delivery that still carries them.
    if (!isHotMeals) await replaceMealLines(deliveryId, []);
    const { error } = await supabase
      .from("sms_sbfp_deliveries")
      .update(payload)
      .eq("id", deliveryId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase
      .from("sms_sbfp_deliveries")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    deliveryId = Number(data.id);
  }
  if (isHotMeals) await replaceMealLines(deliveryId, delivery.meals);
}

export async function deleteDelivery(id: string): Promise<void> {
  const { error } = await supabase.from("sms_sbfp_deliveries").delete().eq("id", Number(id));
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Feedback Mechanism (migration 212)
// ---------------------------------------------------------------------------

export interface SbfpFeedback {
  id: string;
  received_on: string;
  source: string | null;
  raised_by: string | null;
  category: string | null;
  concern: string;
  action_taken: string | null;
  status: SbfpFeedbackStatus;
  resolved_on: string | null;
  created_by: string | null;
  created_by_name: string | null;
}

export type SbfpFeedbackInput = Omit<SbfpFeedback, "id" | "created_by" | "created_by_name"> & {
  id?: string;
};

export async function fetchFeedback(programId: string): Promise<SbfpFeedback[]> {
  const { data, error } = await supabase
    .from("sms_sbfp_feedback")
    .select("*, author:sms_users!sms_sbfp_feedback_created_by_fkey(name)")
    .eq("program_id", Number(programId))
    .order("received_on", { ascending: true })
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => {
    const author = f.author as { name?: string | null } | null;
    return {
      id: String(f.id),
      received_on: String(f.received_on).slice(0, 10),
      source: str(f.source),
      raised_by: str(f.raised_by),
      category: str(f.category),
      concern: String(f.concern),
      action_taken: str(f.action_taken),
      status: f.status as SbfpFeedbackStatus,
      resolved_on: f.resolved_on ? String(f.resolved_on).slice(0, 10) : null,
      created_by: f.created_by != null ? String(f.created_by) : null,
      created_by_name: author?.name ?? null,
    };
  });
}

export async function saveFeedback(programId: string, entry: SbfpFeedbackInput): Promise<void> {
  const payload = {
    program_id: Number(programId),
    received_on: entry.received_on,
    source: entry.source?.trim() || null,
    raised_by: entry.raised_by?.trim() || null,
    category: entry.category?.trim() || null,
    concern: entry.concern.trim(),
    action_taken: entry.action_taken?.trim() || null,
    status: entry.status,
    resolved_on: entry.status === "resolved" ? entry.resolved_on || null : null,
  };
  const { error } = entry.id
    ? await supabase.from("sms_sbfp_feedback").update(payload).eq("id", Number(entry.id))
    : await supabase.from("sms_sbfp_feedback").insert(payload);
  if (error) throw new Error(error.message);
}

export async function deleteFeedback(id: string): Promise<void> {
  const { error } = await supabase.from("sms_sbfp_feedback").delete().eq("id", Number(id));
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Monitoring tools (migration 220)
// ---------------------------------------------------------------------------

export interface SbfpKitchen {
  id: string;
  school_id: string;
  school_name: string;
  sort_order: number;
  is_active: boolean;
}

export async function fetchKitchens(): Promise<SbfpKitchen[]> {
  const { data, error } = await supabase
    .from("sms_sbfp_kitchens")
    .select("id, school_id, sort_order, is_active, school:sms_schools(name)")
    .order("sort_order")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((k) => {
    const school = k.school as { name?: string | null } | null;
    return {
      id: String(k.id),
      school_id: String(k.school_id),
      school_name: school?.name ?? "",
      sort_order: Number(k.sort_order ?? 0),
      is_active: Boolean(k.is_active),
    };
  });
}

export async function addKitchen(schoolId: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from("sms_sbfp_kitchens")
    .insert({ school_id: Number(schoolId), sort_order: sortOrder });
  if (error) throw new Error(error.message);
}

export async function setKitchenActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("sms_sbfp_kitchens")
    .update({ is_active: isActive })
    .eq("id", Number(id));
  if (error) throw new Error(error.message);
}

/** Every active school of the division, for the district grids — test schools left out. */
export async function fetchDivisionSchools(): Promise<SbfpSchoolOption[]> {
  const { data, error } = await supabase
    .from("sms_schools")
    .select("id, name, district")
    .eq("is_active", true)
    .not("id", "in", TEST_SCHOOL_ID_FILTER)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    id: String(s.id),
    name: String(s.name ?? ""),
    district: str(s.district),
  }));
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const toIds = (v: readonly string[]): number[] => [...new Set(v)].map(Number);
const bool = (v: unknown): boolean | null => (v == null ? null : Boolean(v));
const count = (v: unknown): number | null => (v == null ? null : Number(v));
const yesNo = (v: unknown): YesNoAnswers => {
  const out: YesNoAnswers = {};
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === "boolean") out[k] = x;
    }
  }
  return out;
};
const authorName = (row: Record<string, unknown>): string | null =>
  (row.author as { name?: string | null } | null)?.name ?? null;

/** Fields every monitoring entry carries. */
interface LogMeta {
  id: string;
  created_by: string | null;
  created_by_name: string | null;
}

type LogInput<T extends LogMeta> = Omit<T, "id" | "created_by" | "created_by_name"> & {
  id?: string;
};

async function fetchLogs<T extends LogMeta>(
  table: string,
  programId: string,
  orderBy: string,
  map: (row: Record<string, unknown>) => Omit<T, keyof LogMeta>,
): Promise<T[]> {
  const columns: string = `*, author:sms_users!${table}_created_by_fkey(name)`;
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("program_id", Number(programId))
    .order(orderBy, { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(
    (row) =>
      ({
        ...map(row),
        id: String(row.id),
        created_by: row.created_by != null ? String(row.created_by) : null,
        created_by_name: authorName(row),
      }) as T,
  );
}

async function saveLog(
  table: string,
  programId: string,
  id: string | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  const row = { program_id: Number(programId), ...payload };
  const { error } = id
    ? await supabase.from(table).update(row).eq("id", Number(id))
    : await supabase.from(table).insert(row);
  if (error) throw new Error(error.message);
}

async function deleteLog(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", Number(id));
  if (error) throw new Error(error.message);
}

const trimOrNull = (v: string | null | undefined) => v?.trim() || null;

// Daily Monitoring Tool for Kitchens -----------------------------------------

export interface SbfpKitchenLog extends LogMeta {
  logged_at: string;
  /** NULL = at school site. */
  kitchen_id: string | null;
  target_school_ids: string[];
  actual_school_ids: string[];
  has_excess_food: boolean | null;
  has_rejected_food: boolean | null;
  rejected_reason: string | null;
  hygiene_checklist: YesNoAnswers;
  vehicle_checklist: YesNoAnswers;
  delivery_personnel_name: string | null;
  remarks: string | null;
}

export type SbfpKitchenLogInput = LogInput<SbfpKitchenLog>;

export const fetchKitchenLogs = (programId: string) =>
  fetchLogs<SbfpKitchenLog>("sms_sbfp_kitchen_logs", programId, "logged_at", (r) => ({
    logged_at: String(r.logged_at),
    kitchen_id: r.kitchen_id != null ? String(r.kitchen_id) : null,
    target_school_ids: ids(r.target_school_ids),
    actual_school_ids: ids(r.actual_school_ids),
    has_excess_food: bool(r.has_excess_food),
    has_rejected_food: bool(r.has_rejected_food),
    rejected_reason: str(r.rejected_reason),
    hygiene_checklist: yesNo(r.hygiene_checklist),
    vehicle_checklist: yesNo(r.vehicle_checklist),
    delivery_personnel_name: str(r.delivery_personnel_name),
    remarks: str(r.remarks),
  }));

export const saveKitchenLog = (programId: string, e: SbfpKitchenLogInput) =>
  saveLog("sms_sbfp_kitchen_logs", programId, e.id, {
    logged_at: e.logged_at,
    kitchen_id: e.kitchen_id ? Number(e.kitchen_id) : null,
    target_school_ids: toIds(e.target_school_ids),
    actual_school_ids: toIds(e.actual_school_ids),
    has_excess_food: e.has_excess_food,
    has_rejected_food: e.has_rejected_food,
    rejected_reason: e.has_rejected_food ? trimOrNull(e.rejected_reason) : null,
    hygiene_checklist: e.hygiene_checklist,
    vehicle_checklist: e.vehicle_checklist,
    delivery_personnel_name: e.vehicle_checklist.personnel_identified
      ? trimOrNull(e.delivery_personnel_name)
      : null,
    remarks: trimOrNull(e.remarks),
  });

export const deleteKitchenLog = (id: string) => deleteLog("sms_sbfp_kitchen_logs", id);

// Food Dispatch Daily Monitoring Tool -----------------------------------------

export interface SbfpDispatchLog extends LogMeta {
  logged_at: string;
  kitchen_id: string | null;
  school_ids: string[];
  vehicle_type: string | null;
  vehicle_other: string | null;
  /** "HH:MM:SS" */
  departed_at: string | null;
  weather: string | null;
  remarks: string | null;
}

export type SbfpDispatchLogInput = LogInput<SbfpDispatchLog>;

export const fetchDispatchLogs = (programId: string) =>
  fetchLogs<SbfpDispatchLog>("sms_sbfp_dispatch_logs", programId, "logged_at", (r) => ({
    logged_at: String(r.logged_at),
    kitchen_id: r.kitchen_id != null ? String(r.kitchen_id) : null,
    school_ids: ids(r.school_ids),
    vehicle_type: str(r.vehicle_type),
    vehicle_other: str(r.vehicle_other),
    departed_at: str(r.departed_at),
    weather: str(r.weather),
    remarks: str(r.remarks),
  }));

export const saveDispatchLog = (programId: string, e: SbfpDispatchLogInput) =>
  saveLog("sms_sbfp_dispatch_logs", programId, e.id, {
    logged_at: e.logged_at,
    kitchen_id: e.kitchen_id ? Number(e.kitchen_id) : null,
    school_ids: toIds(e.school_ids),
    vehicle_type: trimOrNull(e.vehicle_type),
    vehicle_other: trimOrNull(e.vehicle_other),
    departed_at: e.departed_at || null,
    weather: trimOrNull(e.weather),
    remarks: trimOrNull(e.remarks),
  });

export const deleteDispatchLog = (id: string) => deleteLog("sms_sbfp_dispatch_logs", id);

// School Recipient Daily Receiving and Feeding Monitoring Tool ---------------

export interface SbfpReceivingLog extends LogMeta {
  received_on: string;
  arrived_at: string | null;
  weather: string | null;
  delivery_remarks: string | null;
  /** item code → good / fair / poor */
  food_condition: Record<string, string>;
  condition_remarks: string | null;
  sets_expected: number | null;
  sets_received: number | null;
  sets_damaged: number;
  sets_rejected: number;
  sets_additional: number;
  safety_checklist: YesNoAnswers;
  total_beneficiaries: number | null;
  present_beneficiaries: number | null;
  absent_beneficiaries: number;
  meals_consumed: number | null;
  leftover_meals: number;
  additional_serving_requests: number;
  has_incident: boolean | null;
  incident_details: string | null;
  remarks: string | null;
}

export type SbfpReceivingLogInput = LogInput<SbfpReceivingLog>;

const stringMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === "string") out[k] = x;
    }
  }
  return out;
};

export const fetchReceivingLogs = (programId: string) =>
  fetchLogs<SbfpReceivingLog>("sms_sbfp_receiving_logs", programId, "received_on", (r) => ({
    received_on: String(r.received_on).slice(0, 10),
    arrived_at: str(r.arrived_at),
    weather: str(r.weather),
    delivery_remarks: str(r.delivery_remarks),
    food_condition: stringMap(r.food_condition),
    condition_remarks: str(r.condition_remarks),
    sets_expected: count(r.sets_expected),
    sets_received: count(r.sets_received),
    sets_damaged: Number(r.sets_damaged ?? 0),
    sets_rejected: Number(r.sets_rejected ?? 0),
    sets_additional: Number(r.sets_additional ?? 0),
    safety_checklist: yesNo(r.safety_checklist),
    total_beneficiaries: count(r.total_beneficiaries),
    present_beneficiaries: count(r.present_beneficiaries),
    absent_beneficiaries: Number(r.absent_beneficiaries ?? 0),
    meals_consumed: count(r.meals_consumed),
    leftover_meals: Number(r.leftover_meals ?? 0),
    additional_serving_requests: Number(r.additional_serving_requests ?? 0),
    has_incident: bool(r.has_incident),
    incident_details: str(r.incident_details),
    remarks: str(r.remarks),
  }));

export const saveReceivingLog = (programId: string, e: SbfpReceivingLogInput) =>
  saveLog("sms_sbfp_receiving_logs", programId, e.id, {
    received_on: e.received_on,
    arrived_at: e.arrived_at || null,
    weather: trimOrNull(e.weather),
    delivery_remarks: trimOrNull(e.delivery_remarks),
    food_condition: e.food_condition,
    condition_remarks: trimOrNull(e.condition_remarks),
    sets_expected: e.sets_expected,
    sets_received: e.sets_received,
    sets_damaged: e.sets_damaged,
    sets_rejected: e.sets_rejected,
    sets_additional: e.sets_additional,
    safety_checklist: e.safety_checklist,
    total_beneficiaries: e.total_beneficiaries,
    present_beneficiaries: e.present_beneficiaries,
    absent_beneficiaries: e.absent_beneficiaries,
    meals_consumed: e.meals_consumed,
    leftover_meals: e.leftover_meals,
    additional_serving_requests: e.additional_serving_requests,
    has_incident: e.has_incident,
    incident_details: e.has_incident ? trimOrNull(e.incident_details) : null,
    remarks: trimOrNull(e.remarks),
  });

export const deleteReceivingLog = (id: string) => deleteLog("sms_sbfp_receiving_logs", id);

/** How many beneficiaries the programme has — the tool's auto-populated total. */
export async function countBeneficiaries(programId: string): Promise<number> {
  const { count: n, error } = await supabase
    .from("sms_sbfp_beneficiaries")
    .select("id", { count: "exact", head: true })
    .eq("program_id", Number(programId));
  if (error) throw new Error(error.message);
  return n ?? 0;
}

/**
 * Present / absent on a feeding day, from Daily Feeding (Form 3) codes — a
 * suggestion for the receiving tool, which the user can overwrite. Null when
 * nobody has a code that day.
 */
export async function feedingDayAttendance(
  programId: string,
  day: string,
): Promise<{ present: number; absent: number } | null> {
  const { data: bens, error: bErr } = await supabase
    .from("sms_sbfp_beneficiaries")
    .select("id")
    .eq("program_id", Number(programId));
  if (bErr) throw new Error(bErr.message);
  const benIds = (bens ?? []).map((b) => Number(b.id));
  let present = 0;
  let absent = 0;
  for (let i = 0; i < benIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from("sms_sbfp_feeding_records")
      .select("code")
      .in("beneficiary_id", benIds.slice(i, i + ID_CHUNK))
      .eq("feeding_date", day);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      if (r.code === SBFP_ABSENT_CODE) absent += 1;
      else present += 1;
    }
  }
  return present + absent === 0 ? null : { present, absent };
}

// Daily Hot Meals Quality Evaluation Tool ------------------------------------

export async function fetchQualityQuestions(): Promise<QualityQuestion[]> {
  const { data, error } = await supabase
    .from("sms_sbfp_quality_questions")
    .select("*")
    .order("sort_order")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((q) => ({
    id: String(q.id),
    code: String(q.code),
    kind: q.kind as QualityQuestion["kind"],
    prompt: String(q.prompt),
    sort_order: Number(q.sort_order ?? 0),
    is_active: Boolean(q.is_active),
  }));
}

export async function saveQualityQuestion(
  q: Omit<QualityQuestion, "id" | "code"> & { id?: string },
): Promise<void> {
  const payload = {
    kind: q.kind,
    prompt: q.prompt.trim(),
    sort_order: q.sort_order,
    is_active: q.is_active,
  };
  const { error } = q.id
    ? await supabase.from("sms_sbfp_quality_questions").update(payload).eq("id", Number(q.id))
    : await supabase
        .from("sms_sbfp_quality_questions")
        .insert({ ...payload, code: `q_${Date.now().toString(36)}` });
  if (error) throw new Error(error.message);
}

export interface SbfpQualityResponse extends LogMeta {
  evaluated_on: string;
  beneficiary_id: string | null;
  /** question id → face value (number) or text */
  answers: Record<string, string | number>;
}

export type SbfpQualityResponseInput = LogInput<SbfpQualityResponse>;

export const fetchQualityResponses = (programId: string) =>
  fetchLogs<SbfpQualityResponse>(
    "sms_sbfp_quality_responses",
    programId,
    "evaluated_on",
    (r) => {
      const answers: Record<string, string | number> = {};
      if (r.answers && typeof r.answers === "object") {
        for (const [k, v] of Object.entries(r.answers as Record<string, unknown>)) {
          if (typeof v === "number" || typeof v === "string") answers[k] = v;
        }
      }
      return {
        evaluated_on: String(r.evaluated_on).slice(0, 10),
        beneficiary_id: r.beneficiary_id != null ? String(r.beneficiary_id) : null,
        answers,
      };
    },
  );

export const saveQualityResponse = (programId: string, e: SbfpQualityResponseInput) =>
  saveLog("sms_sbfp_quality_responses", programId, e.id, {
    evaluated_on: e.evaluated_on,
    beneficiary_id: e.beneficiary_id ? Number(e.beneficiary_id) : null,
    answers: Object.fromEntries(
      Object.entries(e.answers).filter(([, v]) => v !== "" && v !== null && v !== undefined),
    ),
  });

export const deleteQualityResponse = (id: string) => deleteLog("sms_sbfp_quality_responses", id);
