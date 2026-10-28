/**
 * The SBFP division dashboard's arithmetic (migration 222).
 *
 * `sbfp_division_overview` returns one row of counts per school and
 * `sbfp_division_nutrition` one row per (school, period, grade, sex, band);
 * everything above a school — a district, the division — is summed here, so
 * every level agrees with the one beneath it (193's shape). Rates are always
 * recomputed from summed numerators and denominators, never averaged from the
 * schools' own rates, which would weigh a 12-learner school like a 300-learner
 * one.
 */

import { SBFP_DISTRICTS } from "@/lib/constants/sbfp";
import { districtKey } from "@/lib/utils/sbfp";
import type { SbfpWeighingPeriod } from "@/lib/constants/sbfp";

/** The counted columns of `sbfp_division_overview`, in its order. */
export const OVERVIEW_COUNT_KEYS = [
  "beneficiaries",
  "male",
  "female",
  "primary_count",
  "secondary_count",
  "milk_participants",
  "baseline_weighed",
  "midline_weighed",
  "endline_weighed",
  "wasted_at_baseline",
  "rehabilitated",
  "feeding_days",
  "days_present",
  "deliveries",
  "packs_new",
  "packs_replacement",
  "packs_rejected",
  "hot_meal_deliveries",
  "servings_new",
  "servings_replacement",
  "servings_rejected",
  "feedback_open",
  "feedback_in_progress",
  "feedback_resolved",
  "kitchen_logs",
  "dispatch_logs",
  "receiving_logs",
  "quality_evaluations",
] as const;

export type OverviewCountKey = (typeof OVERVIEW_COUNT_KEYS)[number];

export interface SbfpOverviewSchool extends Record<OverviewCountKey, number> {
  school_id: string;
  school_name: string;
  district: string | null;
  /** Null when the school has not opened a programme for the year. */
  program_id: string | null;
  is_last_mile_school: boolean | null;
  feeding_start_date: string | null;
  feeding_end_date: string | null;
}

export interface SbfpNutritionRow {
  school_id: string;
  period: SbfpWeighingPeriod;
  grade_level: number | null;
  sex: "male" | "female" | "unspecified";
  nutritional_status: string | null;
  height_for_age: string | null;
  learners: number;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

export function normalizeOverviewRow(row: Record<string, unknown>): SbfpOverviewSchool {
  const counts = Object.fromEntries(
    OVERVIEW_COUNT_KEYS.map((k) => [k, num(row[k])]),
  ) as Record<OverviewCountKey, number>;
  return {
    ...counts,
    school_id: String(row.school_id),
    school_name: String(row.school_name ?? ""),
    district: str(row.district),
    program_id: str(row.program_id),
    is_last_mile_school:
      row.is_last_mile_school == null ? null : Boolean(row.is_last_mile_school),
    feeding_start_date: str(row.feeding_start_date),
    feeding_end_date: str(row.feeding_end_date),
  };
}

export function normalizeNutritionRow(row: Record<string, unknown>): SbfpNutritionRow {
  const sex = String(row.sex ?? "");
  return {
    school_id: String(row.school_id),
    period: String(row.period) as SbfpWeighingPeriod,
    grade_level: row.grade_level == null ? null : Number(row.grade_level),
    sex: sex === "male" || sex === "female" ? sex : "unspecified",
    nutritional_status: str(row.nutritional_status),
    height_for_age: str(row.height_for_age),
    learners: num(row.learners),
  };
}

// ---------------------------------------------------------------------------
// Districts
// ---------------------------------------------------------------------------

/** Filter value meaning "every district". */
export const ALL_DISTRICTS = "__all__";
/** Filter value for schools whose district names none of the five. */
export const OTHER_DISTRICT = "__other__";

export function schoolDistrict(district: string | null): string {
  return districtKey(district, SBFP_DISTRICTS) ?? OTHER_DISTRICT;
}

export function inDistrict(district: string | null, filter: string): boolean {
  return filter === ALL_DISTRICTS || schoolDistrict(district) === filter;
}

// ---------------------------------------------------------------------------
// Totals and rates
// ---------------------------------------------------------------------------

export interface SbfpOverviewTotals extends Record<OverviewCountKey, number> {
  schools: number;
  schoolsWithProgram: number;
  schoolsFeeding: number;
  /** Σ beneficiaries × feeding days — Form 1B's denominator, summed. */
  expectedFeedings: number;
}

export function sumOverview(rows: readonly SbfpOverviewSchool[]): SbfpOverviewTotals {
  const totals = Object.fromEntries(OVERVIEW_COUNT_KEYS.map((k) => [k, 0])) as Record<
    OverviewCountKey,
    number
  >;
  let schoolsWithProgram = 0;
  let schoolsFeeding = 0;
  let expectedFeedings = 0;
  for (const r of rows) {
    for (const k of OVERVIEW_COUNT_KEYS) totals[k] += r[k];
    if (r.program_id) schoolsWithProgram += 1;
    if (r.beneficiaries > 0) schoolsFeeding += 1;
    expectedFeedings += r.beneficiaries * r.feeding_days;
  }
  return {
    ...totals,
    schools: rows.length,
    schoolsWithProgram,
    schoolsFeeding,
    expectedFeedings,
  };
}

/** Days present over beneficiaries × feeding days, as a percent; null with none. */
export function attendancePercent(
  r: Pick<SbfpOverviewTotals, "days_present" | "expectedFeedings">,
): number | null {
  return r.expectedFeedings === 0 ? null : (r.days_present / r.expectedFeedings) * 100;
}

/** One school's attendance, on the same rule. */
export function schoolAttendancePercent(r: SbfpOverviewSchool): number | null {
  return attendancePercent({
    days_present: r.days_present,
    expectedFeedings: r.beneficiaries * r.feeding_days,
  });
}

/** Wasted / severely wasted at baseline who reached normal or above by endline. */
export function rehabilitationPercent(
  r: Pick<SbfpOverviewSchool, "rehabilitated" | "wasted_at_baseline">,
): number | null {
  return r.wasted_at_baseline === 0 ? null : (r.rehabilitated / r.wasted_at_baseline) * 100;
}

export function openConcerns(r: Pick<SbfpOverviewSchool, "feedback_open" | "feedback_in_progress">): number {
  return r.feedback_open + r.feedback_in_progress;
}

// ---------------------------------------------------------------------------
// Nutritional status distribution
// ---------------------------------------------------------------------------

export type NutritionAxis = "bmi" | "hfa";

/** Ordered as the scale runs, so a stacked bar reads left (under) to right (over). */
export const BMI_BANDS = [
  { key: "severely_wasted", label: "Severely Wasted" },
  { key: "wasted", label: "Wasted" },
  { key: "normal", label: "Normal" },
  { key: "overweight", label: "Overweight" },
  { key: "obese", label: "Obese" },
] as const;

export const HFA_BANDS = [
  { key: "severely_stunted", label: "Severely Stunted" },
  { key: "stunted", label: "Stunted" },
  { key: "normal", label: "Normal" },
  { key: "tall", label: "Tall" },
] as const;

export function bandsFor(axis: NutritionAxis): readonly { key: string; label: string }[] {
  return axis === "bmi" ? BMI_BANDS : HFA_BANDS;
}

export interface NutritionDistribution {
  period: SbfpWeighingPeriod;
  /** Learners weighed in the period. */
  total: number;
  /** Weighed, but no band recorded on this axis. */
  unrecorded: number;
  bands: { key: string; label: string; count: number; percent: number }[];
}

/**
 * Learners per band for one period. Percent is over the learners WITH a band,
 * so a weighing missing its height-for-age does not read as a smaller Normal.
 */
export function nutritionDistribution(
  rows: readonly SbfpNutritionRow[],
  period: SbfpWeighingPeriod,
  axis: NutritionAxis,
): NutritionDistribution {
  const bands = bandsFor(axis);
  const counts = new Map<string, number>(bands.map((b) => [b.key, 0]));
  let total = 0;
  let unrecorded = 0;
  for (const r of rows) {
    if (r.period !== period) continue;
    total += r.learners;
    const value = axis === "bmi" ? r.nutritional_status : r.height_for_age;
    if (value && counts.has(value)) counts.set(value, counts.get(value)! + r.learners);
    else unrecorded += r.learners;
  }
  const banded = total - unrecorded;
  return {
    period,
    total,
    unrecorded,
    bands: bands.map((b) => {
      const count = counts.get(b.key) ?? 0;
      return { ...b, count, percent: banded === 0 ? 0 : (count / banded) * 100 };
    }),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const INT = new Intl.NumberFormat("en-US");

export function formatCount(n: number): string {
  return INT.format(n);
}

/** "92.4%", or an em dash when there is nothing to divide by. */
export function formatRate(p: number | null, digits = 1): string {
  return p === null ? "—" : `${p.toFixed(digits)}%`;
}
