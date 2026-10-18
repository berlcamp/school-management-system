/**
 * School-Based Feeding Program — reads and writes against migration 209's
 * tables, plus the Learner Health readings used to suggest beneficiaries and
 * to prefill a weighing.
 *
 * Every list read pages through PostgREST's 1,000-row cap: a school feeding 300
 * learners for 120 days holds 36,000 feeding records.
 */

import { ENROLLED_LIFECYCLE_STATUSES } from "@/lib/constants/enrollment";
import type {
  SbfpClassification,
  SbfpContactKind,
  SbfpDeliveryComponent,
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
  SbfpBeneficiaryView,
  SbfpDelivery,
  SbfpReading,
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
    .select("*")
    .eq("program_id", Number(programId))
    .order("delivered_on", { ascending: true, nullsFirst: false })
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: String(d.id),
    component: d.component as SbfpDeliveryComponent,
    grade_level: Number(d.grade_level),
    delivered_on: d.delivered_on ? String(d.delivered_on).slice(0, 10) : null,
    packs_new: Number(d.packs_new ?? 0),
    packs_replacement: Number(d.packs_replacement ?? 0),
    packs_rejected: Number(d.packs_rejected ?? 0),
    remarks: str(d.remarks),
  }));
}

export async function saveDelivery(
  programId: string,
  delivery: Omit<SbfpDelivery, "id"> & { id?: string },
): Promise<void> {
  const payload = {
    program_id: Number(programId),
    component: delivery.component,
    grade_level: delivery.grade_level,
    delivered_on: delivery.delivered_on || null,
    packs_new: delivery.packs_new,
    packs_replacement: delivery.packs_replacement,
    packs_rejected: delivery.packs_rejected,
    remarks: delivery.remarks?.trim() || null,
  };
  const { error } = delivery.id
    ? await supabase.from("sms_sbfp_deliveries").update(payload).eq("id", Number(delivery.id))
    : await supabase.from("sms_sbfp_deliveries").insert(payload);
  if (error) throw new Error(error.message);
}

export async function deleteDelivery(id: string): Promise<void> {
  const { error } = await supabase.from("sms_sbfp_deliveries").delete().eq("id", Number(id));
  if (error) throw new Error(error.message);
}
