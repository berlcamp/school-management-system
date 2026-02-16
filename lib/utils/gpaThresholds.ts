import { supabase } from "@/lib/supabase/client";
import { SectionType } from "@/types";

export interface GpaThresholds {
  homogeneous_fast_learner: {
    minGpa: number;
  };
  homogeneous_crack_section: {
    maxGpa: number;
  };
  heterogeneous: boolean;
  homogeneous_random: boolean;
}

export const DEFAULT_THRESHOLDS: GpaThresholds = {
  homogeneous_fast_learner: { minGpa: 90 },
  homogeneous_crack_section: { maxGpa: 75 },
  heterogeneous: true,
  homogeneous_random: true,
};

export interface GpaThresholdsRow {
  id: number;
  school_id?: number | null; // Foreign key → sms_schools.id
  homogeneous_fast_learner_min: number;
  homogeneous_crack_section_max: number;
  heterogeneous_enabled: boolean;
  homogeneous_random_enabled: boolean;
}

function rowToThresholds(row: GpaThresholdsRow | null): GpaThresholds {
  if (!row) return DEFAULT_THRESHOLDS;
  return {
    homogeneous_fast_learner: { minGpa: Number(row.homogeneous_fast_learner_min) },
    homogeneous_crack_section: { maxGpa: Number(row.homogeneous_crack_section_max) },
    heterogeneous: row.heterogeneous_enabled,
    homogeneous_random: row.homogeneous_random_enabled,
  };
}

/**
 * Fetches GPA thresholds from the database.
 * Returns DEFAULT_THRESHOLDS if no row exists or on error.
 * When schoolId is provided, fetches thresholds for that school.
 */
export async function fetchGpaThresholds(
  schoolId?: string | number | null
): Promise<GpaThresholds> {
  let query = supabase
    .from("sms_gpa_thresholds")
    .select("*")
    .limit(1)
    .order("id", { ascending: true });

  if (schoolId != null) {
    query = query.eq("school_id", schoolId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Failed to fetch GPA thresholds:", error);
    return DEFAULT_THRESHOLDS;
  }
  return rowToThresholds(data as GpaThresholdsRow | null);
}

/**
 * Saves GPA thresholds to the database.
 * Upserts: updates existing row or inserts if none exists.
 * When schoolId is provided, saves/updates thresholds for that school.
 */
export async function saveGpaThresholds(
  thresholds: GpaThresholds,
  schoolId?: string | number | null
): Promise<{ success: boolean; error?: string }> {
  const row = {
    homogeneous_fast_learner_min: thresholds.homogeneous_fast_learner.minGpa,
    homogeneous_crack_section_max: thresholds.homogeneous_crack_section.maxGpa,
    heterogeneous_enabled: thresholds.heterogeneous,
    homogeneous_random_enabled: thresholds.homogeneous_random,
    ...(schoolId != null && { school_id: schoolId }),
  };

  let existingQuery = supabase
    .from("sms_gpa_thresholds")
    .select("id")
    .limit(1);
  if (schoolId != null) {
    existingQuery = existingQuery.eq("school_id", schoolId);
  }
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("sms_gpa_thresholds")
      .update(row)
      .eq("id", (existing as { id: number }).id);

    if (error) {
      console.error("Failed to update GPA thresholds:", error);
      return { success: false, error: error.message };
    }
  } else {
    const { error } = await supabase.from("sms_gpa_thresholds").insert([row]);

    if (error) {
      console.error("Failed to insert GPA thresholds:", error);
      return { success: false, error: error.message };
    }
  }
  return { success: true };
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  heterogeneous: "Heterogeneous",
  homogeneous_fast_learner: "Homogeneous - Fast learner",
  homogeneous_crack_section: "Homogeneous - Crack section",
  homogeneous_random: "Homogeneous - Random",
};

/**
 * Returns the suggested section type label based on student's previous grade GPA.
 */
export function getSuggestedSectionType(
  gpa: number | null | undefined,
  thresholds: GpaThresholds
): string | null {
  if (gpa == null) return null;
  if (gpa >= thresholds.homogeneous_fast_learner.minGpa)
    return SECTION_TYPE_LABELS.homogeneous_fast_learner;
  if (gpa < thresholds.homogeneous_crack_section.maxGpa)
    return SECTION_TYPE_LABELS.homogeneous_crack_section;
  return SECTION_TYPE_LABELS.heterogeneous;
}

/**
 * Returns true if a section of the given type should be shown for a student
 * with the given previous grade GPA.
 */
export function sectionTypeMatchesGpa(
  sectionType: SectionType | null | undefined,
  gpa: number | null | undefined,
  thresholds: GpaThresholds
): boolean {
  if (!sectionType) return true;
  if (gpa == null) return true;

  switch (sectionType) {
    case "heterogeneous":
      return thresholds.heterogeneous;
    case "homogeneous_random":
      return thresholds.homogeneous_random;
    case "homogeneous_fast_learner":
      return gpa >= thresholds.homogeneous_fast_learner.minGpa;
    case "homogeneous_crack_section":
      return gpa < thresholds.homogeneous_crack_section.maxGpa;
    default:
      return true;
  }
}
