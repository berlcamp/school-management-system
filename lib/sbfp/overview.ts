import { supabase } from "@/lib/supabase/client";
import {
  normalizeNutritionRow,
  normalizeOverviewRow,
  type SbfpNutritionRow,
  type SbfpOverviewSchool,
} from "@/lib/utils/sbfpOverview";

/**
 * The SBFP division dashboard's two reads (migration 222). Both are SECURITY
 * DEFINER and admit only the division office and the SBFP Viewer; only counts
 * come back.
 */
/** `gradeLevels` null = every grade level (migration 225). */
export async function fetchSbfpOverview(
  schoolYear: string,
  gradeLevels: number[] | null = null,
): Promise<SbfpOverviewSchool[]> {
  // Sent only when narrowed, so the call still resolves against 222's
  // one-argument function where 225 has not been applied yet.
  const { data, error } = await supabase.rpc(
    "sbfp_division_overview",
    gradeLevels === null
      ? { p_school_year: schoolYear }
      : { p_school_year: schoolYear, p_grade_levels: gradeLevels },
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeOverviewRow);
}

/**
 * PostgREST caps every response at `max_rows` (1,000), RPCs included, and
 * truncates silently. The two nutrition functions return one row per
 * (school, period, grade, sex, band, height-for-age), which passes 1,000 for
 * a whole division — the "All learners" bar read only the first page. Page
 * through on the group key, which is unique, so no row repeats or is skipped.
 */
const NUTRITION_PAGE = 1000;

async function fetchAllNutritionRows(
  fn: "sbfp_division_nutrition" | "sbfp_division_learner_nutrition",
  schoolYear: string,
): Promise<SbfpNutritionRow[]> {
  const rows: SbfpNutritionRow[] = [];
  for (let from = 0; ; from += NUTRITION_PAGE) {
    const { data, error } = await supabase
      .rpc(fn, { p_school_year: schoolYear })
      .order("school_id")
      .order("period")
      .order("grade_level")
      .order("sex")
      .order("nutritional_status")
      .order("height_for_age")
      .range(from, from + NUTRITION_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page.map(normalizeNutritionRow));
    if (page.length < NUTRITION_PAGE) return rows;
  }
}

export async function fetchSbfpNutrition(schoolYear: string): Promise<SbfpNutritionRow[]> {
  return fetchAllNutritionRows("sbfp_division_nutrition", schoolYear);
}

/**
 * Every learner the division weighed in Learner Health (migration 224), in the
 * same row shape as `fetchSbfpNutrition` — the comparison beside the
 * beneficiaries. Periods are baseline and endline only; Learner Health has no
 * midline.
 */
export async function fetchDivisionLearnerNutrition(schoolYear: string): Promise<SbfpNutritionRow[]> {
  return fetchAllNutritionRows("sbfp_division_learner_nutrition", schoolYear);
}

/** Enrolled learners per school and grade (both sexes summed). */
export interface SbfpEnrolledRow {
  /** String, like every other id in `sbfpOverview.ts`. */
  school_id: string;
  grade_level: number;
  learners: number;
}

/**
 * Every learner enrolled in the division, weighed or not — the denominator
 * beside the "All learners" bar, so the division office can see how much of
 * the roll Learner Health has actually weighed. Reads `public_enrollment_counts`
 * (141 → 142 → 206), the headcount rule every enrolment figure uses: approved,
 * on the roll, active schools, test schools out. Paged past the row cap.
 */
export async function fetchDivisionEnrolled(schoolYear: string): Promise<SbfpEnrolledRow[]> {
  const rows: SbfpEnrolledRow[] = [];
  for (let from = 0; ; from += NUTRITION_PAGE) {
    const { data, error } = await supabase
      .rpc("public_enrollment_counts", { p_school_year: schoolYear })
      .order("school_id")
      .order("grade_level")
      .range(from, from + NUTRITION_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Record<string, unknown>[];
    for (const r of page) {
      rows.push({
        school_id: String(r.school_id),
        grade_level: Number(r.grade_level),
        learners: Number(r.male ?? 0) + Number(r.female ?? 0),
      });
    }
    if (page.length < NUTRITION_PAGE) return rows;
  }
}
