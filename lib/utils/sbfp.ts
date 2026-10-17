/**
 * School-Based Feeding Program — the arithmetic behind SBFP Forms 1B, 2, 5
 * (consolidated) and 6. Pure: no database, no DOM, so the screen, the printout
 * and the tests all count the same way.
 *
 * A beneficiary carries the programme's three weighings — baseline, midline,
 * endline — from `sms_sbfp_measurements` (migration 209), each with its own
 * date.
 */

import {
  SBFP_ABSENT_CODE,
  SBFP_FEEDING_CODES,
  type SbfpClassification,
  type SbfpDeliveryComponent,
  type SbfpMilkTolerance,
  type SbfpWeighingPeriod,
} from "@/lib/constants/sbfp";
import type { LearnerSexKey } from "@/lib/utils/learnerSex";
import {
  ageInMonths,
  formatAge,
  type HeightForAge,
  type NutritionalStatus,
} from "@/lib/utils/nutritionalStatus";

/** One weighing, as the forms print it. */
export interface SbfpReading {
  measured_at: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  nutritional_status: NutritionalStatus | null;
  height_for_age: HeightForAge | null;
}

/** A beneficiary joined to the learner, their section and both readings. */
export interface SbfpBeneficiaryView {
  id: string;
  student_id: string;
  section_id: string | null;
  /** "SURNAME, First Middle" — the master list's spelling. */
  name: string;
  lrn: string | null;
  sex: LearnerSexKey;
  date_of_birth: string | null;
  grade_level: number | null;
  section_name: string;
  classification: SbfpClassification;
  is_pregnant: boolean;
  has_infant: boolean;
  is_dewormed: boolean;
  milk_consent: boolean | null;
  is_previous_beneficiary: boolean;
  is_pardo: boolean;
  is_indigent: boolean;
  /** Read live from `sms_students.is_4ps`. */
  is_4ps: boolean;
  /** Read live from `sms_students.ip_ethnic_group` (blank = not IP). */
  is_ip: boolean;
  milk_tolerance: SbfpMilkTolerance | null;
  baseline: SbfpReading | null;
  midline: SbfpReading | null;
  endline: SbfpReading | null;
}

/** The beneficiary's weighing for one period. */
export function readingFor(
  row: Pick<SbfpBeneficiaryView, SbfpWeighingPeriod>,
  period: SbfpWeighingPeriod,
): SbfpReading | null {
  return row[period];
}

export interface SbfpDelivery {
  id: string;
  component: SbfpDeliveryComponent;
  grade_level: number;
  delivered_on: string | null;
  packs_new: number;
  packs_replacement: number;
  packs_rejected: number;
  remarks: string | null;
}

// ---------------------------------------------------------------------------
// Feeding codes and attendance
// ---------------------------------------------------------------------------

export function isFeedingCode(value: string): boolean {
  return (SBFP_FEEDING_CODES as readonly string[]).includes(value);
}

/** Every code but A is a learner present and fed. Blank is not recorded. */
export function isPresentCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return isFeedingCode(code) && code !== SBFP_ABSENT_CODE;
}

export interface FeedingAttendance {
  /** Form 1B column A — days present. */
  present: number;
  /** Form 1B column B — feeding days. */
  feedingDays: number;
  /** (A ÷ B) × 100, or null with no feeding day yet. */
  percent: number | null;
}

/**
 * Days present over the programme's feeding days. A code recorded on a date
 * that is no longer a feeding day is ignored rather than counted — removing a
 * feeding day is reversible, and nothing is deleted when it happens (the 125
 * school-calendar rule).
 */
export function feedingAttendance(
  codesByDate: ReadonlyMap<string, string>,
  feedingDays: readonly string[],
): FeedingAttendance {
  let present = 0;
  for (const day of feedingDays) {
    if (isPresentCode(codesByDate.get(day))) present += 1;
  }
  const total = feedingDays.length;
  return {
    present,
    feedingDays: total,
    percent: total === 0 ? null : (present / total) * 100,
  };
}

/** Mean of the percentages that exist — Form 1B's "Average Percent Attendance". */
export function averagePercent(values: readonly (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) return null;
  return real.reduce((a, b) => a + b, 0) / real.length;
}

export function formatPercent(value: number | null): string {
  return value === null ? "" : `${value.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * What the baseline makes of a learner, as a suggestion only. DepEd's primary
 * targets are the Severely Wasted and Wasted; Stunted and Severely Stunted
 * learners are secondary targets. Anything else is not suggested — a school
 * feeding every learner (as many do) ticks them by hand.
 */
export function suggestClassification(
  reading: Pick<SbfpReading, "nutritional_status" | "height_for_age"> | null,
): SbfpClassification | null {
  if (!reading) return null;
  if (
    reading.nutritional_status === "severely_wasted" ||
    reading.nutritional_status === "wasted"
  ) {
    return "primary";
  }
  if (
    reading.height_for_age === "severely_stunted" ||
    reading.height_for_age === "stunted"
  ) {
    return "secondary";
  }
  return null;
}

/** Form 6's milk table counts the learners who drink the milk. */
export function isMilkParticipant(
  row: Pick<SbfpBeneficiaryView, "milk_tolerance">,
): boolean {
  return row.milk_tolerance === "none" || row.milk_tolerance === "intolerant_willing";
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Form 2's row caption: "Kinder", "Grade I" … "Grade XII", "SNED". */
export function form2GradeLabel(gradeLevel: number): string {
  if (gradeLevel === -1) return "SNED";
  if (gradeLevel === 0) return "Kinder";
  return `Grade ${ROMAN[gradeLevel] ?? gradeLevel}`;
}

/** Form 6's row caption: "Kinder", "Grade 1" … */
export function form6GradeLabel(gradeLevel: number): string {
  if (gradeLevel === -1) return "SNED";
  if (gradeLevel === 0) return "Kinder";
  return `Grade ${gradeLevel}`;
}

/** The master list's "Grade/ Section" cell: "KINDER/MATINABANGON", "3/RIZAL". */
export function gradeSectionLabel(
  gradeLevel: number | null,
  sectionName: string,
): string {
  const grade =
    gradeLevel === null
      ? ""
      : gradeLevel === -1
        ? "SNED"
        : gradeLevel === 0
          ? "KINDER"
          : String(gradeLevel);
  return [grade, sectionName.toUpperCase()].filter(Boolean).join("/");
}

/** "7 y 2 m" at the date of weighing — the age the bands were read against. */
export function ageAtReading(
  dateOfBirth: string | null,
  reading: Pick<SbfpReading, "measured_at"> | null,
): string {
  if (!reading?.measured_at) return "";
  const months = ageInMonths(dateOfBirth, reading.measured_at);
  return months === null ? "" : formatAge(months);
}

/** Elementary sheets carry SNED, Kinder and Grades 1–6. */
export function isElementaryGrade(gradeLevel: number): boolean {
  return gradeLevel <= 6;
}

// ---------------------------------------------------------------------------
// Form 2 — summary of beneficiaries
// ---------------------------------------------------------------------------

export const FORM2_BMI_BANDS = [
  { key: "severely_wasted", label: "Severely Wasted" },
  { key: "wasted", label: "Wasted" },
  { key: "normal", label: "Normal" },
  { key: "overweight_obese", label: "Overweight + Obese" },
] as const;

export const FORM2_HFA_BANDS = [
  { key: "severely_stunted", label: "Severely Stunted" },
  { key: "stunted", label: "Stunted" },
  { key: "normal", label: "Normal" },
  { key: "tall", label: "Tall" },
] as const;

export type Form2BmiKey = (typeof FORM2_BMI_BANDS)[number]["key"];
export type Form2HfaKey = (typeof FORM2_HFA_BANDS)[number]["key"];

/** One M, F or Total line of Form 2. */
export interface Form2Line {
  bmi: Record<Form2BmiKey, number>;
  bmiTotal: number;
  hfa: Record<Form2HfaKey, number>;
  hfaTotal: number;
  /** M — adolescent pregnant learners / mothers with 0–1 year-old child. */
  pregnantOrMother: number;
  /** N — pupils at risk of dropping out. */
  pardo: number;
  /** O — stunted / severely stunted. */
  stunted: number;
  /** P — indigent learners. */
  indigent: number;
  /** Q — indigenous peoples. */
  ip: number;
  /** R — learners dewormed. */
  dewormed: number;
  /** S — 4Ps beneficiaries. */
  fourPs: number;
  /** T — beneficiaries in previous years (repeaters). */
  repeaters: number;
}

export interface Form2GradeBlock {
  gradeLevel: number;
  male: Form2Line;
  female: Form2Line;
  total: Form2Line;
}

export interface Form2Summary {
  grades: Form2GradeBlock[];
  grandTotal: { male: Form2Line; female: Form2Line; total: Form2Line };
}

function emptyLine(): Form2Line {
  return {
    bmi: { severely_wasted: 0, wasted: 0, normal: 0, overweight_obese: 0 },
    bmiTotal: 0,
    hfa: { severely_stunted: 0, stunted: 0, normal: 0, tall: 0 },
    hfaTotal: 0,
    pregnantOrMother: 0,
    pardo: 0,
    stunted: 0,
    indigent: 0,
    ip: 0,
    dewormed: 0,
    fourPs: 0,
    repeaters: 0,
  };
}

function addLine(into: Form2Line, from: Form2Line): void {
  for (const b of FORM2_BMI_BANDS) into.bmi[b.key] += from.bmi[b.key];
  for (const b of FORM2_HFA_BANDS) into.hfa[b.key] += from.hfa[b.key];
  into.bmiTotal += from.bmiTotal;
  into.hfaTotal += from.hfaTotal;
  into.pregnantOrMother += from.pregnantOrMother;
  into.pardo += from.pardo;
  into.stunted += from.stunted;
  into.indigent += from.indigent;
  into.ip += from.ip;
  into.dewormed += from.dewormed;
  into.fourPs += from.fourPs;
  into.repeaters += from.repeaters;
}

function bmiKey(status: NutritionalStatus | null): Form2BmiKey | null {
  if (status === "overweight" || status === "obese") return "overweight_obese";
  if (status === "severely_wasted" || status === "wasted" || status === "normal") {
    return status;
  }
  return null;
}

/**
 * Counts one sheet of Form 2.
 *
 * The form's column heads decide which beneficiaries each count is drawn from:
 * the weight and height bands and the pregnant / mother column sit under
 * "No. of Primary Targets"; PARDOs, stunted, indigent and IPs under "No. of
 * Secondary Targets"; deworming, 4Ps and repeaters span every beneficiary. The
 * bands are read from the weighing the sheet is for — baseline at the start of
 * feeding, midline part-way, endline at the end. A learner with no weighing in
 * that period simply adds nothing to the band columns.
 */
export function buildForm2Summary(
  rows: readonly SbfpBeneficiaryView[],
  period: SbfpWeighingPeriod,
  gradeLevels: readonly number[],
): Form2Summary {
  const byGrade = new Map<number, { male: Form2Line; female: Form2Line }>();
  for (const g of gradeLevels) {
    byGrade.set(g, { male: emptyLine(), female: emptyLine() });
  }

  for (const row of rows) {
    if (row.grade_level === null) continue;
    const block = byGrade.get(row.grade_level);
    if (!block) continue;
    if (row.sex !== "male" && row.sex !== "female") continue;
    const line = block[row.sex];
    const reading = readingFor(row, period);

    if (row.classification === "primary") {
      const b = bmiKey(reading?.nutritional_status ?? null);
      if (b) {
        line.bmi[b] += 1;
        line.bmiTotal += 1;
      }
      const h = reading?.height_for_age ?? null;
      if (h) {
        line.hfa[h] += 1;
        line.hfaTotal += 1;
      }
      if (row.is_pregnant || row.has_infant) line.pregnantOrMother += 1;
    } else {
      if (row.is_pardo) line.pardo += 1;
      const h = reading?.height_for_age ?? null;
      if (h === "stunted" || h === "severely_stunted") line.stunted += 1;
      if (row.is_indigent) line.indigent += 1;
      if (row.is_ip) line.ip += 1;
    }

    if (row.is_dewormed) line.dewormed += 1;
    if (row.is_4ps) line.fourPs += 1;
    if (row.is_previous_beneficiary) line.repeaters += 1;
  }

  const grand = { male: emptyLine(), female: emptyLine(), total: emptyLine() };
  const grades: Form2GradeBlock[] = gradeLevels.map((g) => {
    const block = byGrade.get(g)!;
    const total = emptyLine();
    addLine(total, block.male);
    addLine(total, block.female);
    addLine(grand.male, block.male);
    addLine(grand.female, block.female);
    addLine(grand.total, total);
    return { gradeLevel: g, male: block.male, female: block.female, total };
  });

  return { grades, grandTotal: grand };
}

/**
 * The grade levels one Form 2 sheet lists: the issued sheet's fixed rows
 * (Kinder–Grade VI, or Grades VII–XII), plus SNED on the elementary sheet when
 * the school has SNED beneficiaries.
 */
export function form2GradeLevels(
  scope: "elementary" | "secondary",
  rows: readonly SbfpBeneficiaryView[],
): number[] {
  if (scope === "secondary") return [7, 8, 9, 10, 11, 12];
  const hasSned = rows.some((r) => r.grade_level === -1);
  return [...(hasSned ? [-1] : []), 0, 1, 2, 3, 4, 5, 6];
}

// ---------------------------------------------------------------------------
// Form 5 (consolidated) — nutritional status and attendance per section
// ---------------------------------------------------------------------------

export const FORM5_BMI_BANDS = [
  { key: "severely_wasted", label: "SW/SU" },
  { key: "wasted", label: "W/U" },
  { key: "normal", label: "N" },
  { key: "overweight", label: "Ow" },
  { key: "obese", label: "Ob" },
] as const;

export type Form5BandKey = (typeof FORM5_BMI_BANDS)[number]["key"];

export interface Form5BandCounts {
  bands: Record<Form5BandKey, number>;
  total: number;
}

export interface Form5SectionRow {
  sectionId: string | null;
  gradeLevel: number | null;
  label: string;
  dewormed: number;
  before: Form5BandCounts;
  after: Form5BandCounts;
  /** Mean of the section's beneficiaries' attendance percentages. */
  attendance: number | null;
}

function emptyBands(): Form5BandCounts {
  return {
    bands: { severely_wasted: 0, wasted: 0, normal: 0, overweight: 0, obese: 0 },
    total: 0,
  };
}

function countBand(into: Form5BandCounts, reading: SbfpReading | null): void {
  const s = reading?.nutritional_status ?? null;
  if (!s) return;
  into.bands[s] += 1;
  into.total += 1;
}

export interface Form5Consolidated {
  sections: Form5SectionRow[];
  total: {
    dewormed: number;
    before: Form5BandCounts;
    after: Form5BandCounts;
    attendance: number | null;
  };
}

/**
 * One row per section, ordered by grade level then section name. Before is the
 * baseline reading, after the endline. The TOTAL row's attendance is the
 * "AVERAGE:" of every beneficiary's percentage, so a large section weighs more
 * than a small one, as it does on Form 1B.
 */
export function buildForm5Consolidated(
  rows: readonly SbfpBeneficiaryView[],
  attendanceById: ReadonlyMap<string, FeedingAttendance>,
): Form5Consolidated {
  const bySection = new Map<string, { row: Form5SectionRow; percents: (number | null)[] }>();

  for (const r of rows) {
    const key = r.section_id ?? "none";
    let entry = bySection.get(key);
    if (!entry) {
      entry = {
        row: {
          sectionId: r.section_id,
          gradeLevel: r.grade_level,
          label: gradeSectionLabel(r.grade_level, r.section_name),
          dewormed: 0,
          before: emptyBands(),
          after: emptyBands(),
          attendance: null,
        },
        percents: [],
      };
      bySection.set(key, entry);
    }
    if (r.is_dewormed) entry.row.dewormed += 1;
    countBand(entry.row.before, r.baseline);
    countBand(entry.row.after, r.endline);
    entry.percents.push(attendanceById.get(r.id)?.percent ?? null);
  }

  const sections = [...bySection.values()]
    .map(({ row, percents }) => ({ ...row, attendance: averagePercent(percents) }))
    .sort(
      (a, b) =>
        (a.gradeLevel ?? 99) - (b.gradeLevel ?? 99) || a.label.localeCompare(b.label),
    );

  const total = {
    dewormed: 0,
    before: emptyBands(),
    after: emptyBands(),
    attendance: averagePercent(
      rows.map((r) => attendanceById.get(r.id)?.percent ?? null),
    ),
  };
  for (const s of sections) {
    total.dewormed += s.dewormed;
    for (const b of FORM5_BMI_BANDS) {
      total.before.bands[b.key] += s.before.bands[b.key];
      total.after.bands[b.key] += s.after.bands[b.key];
    }
    total.before.total += s.before.total;
    total.after.total += s.after.total;
  }

  return { sections, total };
}

// ---------------------------------------------------------------------------
// Form 6 — deliveries
// ---------------------------------------------------------------------------

export interface Form6GradeBlock {
  gradeLevel: number;
  male: number;
  female: number;
  total: number;
  deliveries: SbfpDelivery[];
}

export interface Form6Table {
  grades: Form6GradeBlock[];
  grand: {
    male: number;
    female: number;
    total: number;
    packsNew: number;
    packsReplacement: number;
    packsRejected: number;
  };
}

/**
 * One Form 6 table. Beneficiaries per grade level and sex are counted from the
 * list — every beneficiary for NFP, milk participants for milk — never typed,
 * so they always agree with Forms 1A and 5. Grade levels are the issued sheet's
 * Kinder–Grade 6, widened by any other grade that has beneficiaries or a
 * delivery.
 */
export function buildForm6Table(
  rows: readonly SbfpBeneficiaryView[],
  deliveries: readonly SbfpDelivery[],
  component: SbfpDeliveryComponent,
): Form6Table {
  const counted = component === "milk" ? rows.filter(isMilkParticipant) : rows;
  const own = deliveries
    .filter((d) => d.component === component)
    .sort((a, b) => (a.delivered_on ?? "").localeCompare(b.delivered_on ?? ""));

  const levels = new Set<number>([0, 1, 2, 3, 4, 5, 6]);
  for (const r of counted) if (r.grade_level !== null) levels.add(r.grade_level);
  for (const d of own) levels.add(d.grade_level);

  const grand = {
    male: 0,
    female: 0,
    total: 0,
    packsNew: 0,
    packsReplacement: 0,
    packsRejected: 0,
  };

  const grades = [...levels]
    .sort((a, b) => a - b)
    .map((g) => {
      const here = counted.filter((r) => r.grade_level === g);
      const male = here.filter((r) => r.sex === "male").length;
      const female = here.filter((r) => r.sex === "female").length;
      const ds = own.filter((d) => d.grade_level === g);
      grand.male += male;
      grand.female += female;
      grand.total += here.length;
      for (const d of ds) {
        grand.packsNew += d.packs_new;
        grand.packsReplacement += d.packs_replacement;
        grand.packsRejected += d.packs_rejected;
      }
      return { gradeLevel: g, male, female, total: here.length, deliveries: ds };
    });

  return { grades, grand };
}

// ---------------------------------------------------------------------------
// Feeding days
// ---------------------------------------------------------------------------

/** "2026-08" → the feeding days that fall in it, in date order. */
export function feedingDaysInMonth(
  feedingDays: readonly string[],
  yearMonth: string,
): string[] {
  return feedingDays.filter((d) => d.startsWith(`${yearMonth}-`)).sort();
}

/** "2026-2027" → "2026-06" … "2027-05", the months a feeding month is picked from. */
export function schoolYearMonths(schoolYear: string): string[] {
  const [start] = schoolYear.split("-").map(Number);
  if (!start) return [];
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((5 + i) % 12) + 1;
    const year = start + (5 + i >= 12 ? 1 : 0);
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

/** Form 3 prints at least the issued sheet's 20 day columns. */
export const FORM3_MIN_DAY_COLUMNS = 20;
