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

export async function fetchSbfpNutrition(schoolYear: string): Promise<SbfpNutritionRow[]> {
  const { data, error } = await supabase.rpc("sbfp_division_nutrition", {
    p_school_year: schoolYear,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeNutritionRow);
}

/**
 * Every learner the division weighed in Learner Health (migration 224), in the
 * same row shape as `fetchSbfpNutrition` — the comparison beside the
 * beneficiaries. Periods are baseline and endline only; Learner Health has no
 * midline.
 */
export async function fetchDivisionLearnerNutrition(schoolYear: string): Promise<SbfpNutritionRow[]> {
  const { data, error } = await supabase.rpc("sbfp_division_learner_nutrition", {
    p_school_year: schoolYear,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeNutritionRow);
}
