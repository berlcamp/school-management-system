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
export async function fetchSbfpOverview(schoolYear: string): Promise<SbfpOverviewSchool[]> {
  const { data, error } = await supabase.rpc("sbfp_division_overview", {
    p_school_year: schoolYear,
  });
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
