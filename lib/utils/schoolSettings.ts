import { supabase } from "@/lib/supabase/client";

export interface SchoolSettings {
  allow_edit_previous_school_year: boolean;
  promotion_deadline: string | null;
  principal_name: string | null;
  principal_title: string | null;
  allow_edit_promoted_student_grades: boolean;
  /** Public /schools/[slug] page hero background; optional image URL */
  landing_hero_image_url: string | null;
  /** SNED School Coordinator; signatory on the printed SNED consent form */
  sned_coordinator_name: string | null;
}

export const DEFAULT_SETTINGS: SchoolSettings = {
  allow_edit_previous_school_year: false,
  promotion_deadline: null,
  principal_name: null,
  principal_title: "Principal",
  allow_edit_promoted_student_grades: true,
  landing_hero_image_url: null,
  sned_coordinator_name: null,
};

interface SchoolSettingsRow {
  id: number;
  school_id: string | null;
  allow_edit_previous_school_year: boolean;
  promotion_deadline: string | null;
  principal_name: string | null;
  principal_title: string | null;
  allow_edit_promoted_student_grades: boolean;
  landing_hero_image_url: string | null;
  sned_coordinator_name: string | null;
}

/**
 * Fetches school settings from the database.
 * Returns DEFAULT_SETTINGS if no row exists or on error.
 * When schoolId is provided, fetches settings for that school.
 */
export async function fetchSchoolSettings(
  schoolId?: string | number | null
): Promise<SchoolSettings> {
  let query = supabase
    .from("sms_school_settings")
    .select("*")
    .limit(1)
    .order("id", { ascending: true });

  if (schoolId != null) {
    query = query.eq("school_id", schoolId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Failed to fetch school settings:", error);
    return DEFAULT_SETTINGS;
  }

  if (!data) return DEFAULT_SETTINGS;

  const row = data as SchoolSettingsRow;
  return {
    allow_edit_previous_school_year: row.allow_edit_previous_school_year,
    promotion_deadline: row.promotion_deadline ?? null,
    principal_name: row.principal_name ?? null,
    principal_title: row.principal_title ?? "Principal",
    allow_edit_promoted_student_grades: row.allow_edit_promoted_student_grades ?? true,
    landing_hero_image_url: row.landing_hero_image_url ?? null,
    sned_coordinator_name: row.sned_coordinator_name ?? null,
  };
}

/**
 * Saves school settings to the database.
 * Upserts: updates existing row or inserts if none exists.
 * When schoolId is provided, saves/updates settings for that school.
 */
export async function saveSchoolSettings(
  settings: SchoolSettings,
  schoolId?: string | number | null
): Promise<{ success: boolean; error?: string }> {
  const row = {
    allow_edit_previous_school_year: settings.allow_edit_previous_school_year,
    promotion_deadline: settings.promotion_deadline,
    principal_name: settings.principal_name,
    principal_title: settings.principal_title,
    allow_edit_promoted_student_grades: settings.allow_edit_promoted_student_grades,
    landing_hero_image_url: settings.landing_hero_image_url,
    sned_coordinator_name: settings.sned_coordinator_name,
    ...(schoolId != null && { school_id: String(schoolId) }),
  };

  let existingQuery = supabase
    .from("sms_school_settings")
    .select("id")
    .limit(1);
  if (schoolId != null) {
    existingQuery = existingQuery.eq("school_id", schoolId);
  }
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("sms_school_settings")
      .update(row)
      .eq("id", (existing as { id: number }).id);

    if (error) {
      console.error("Failed to update school settings:", error);
      return { success: false, error: error.message };
    }
  } else {
    const { error } = await supabase
      .from("sms_school_settings")
      .insert([{ ...row, ...(schoolId == null && { school_id: null }) }]);

    if (error) {
      console.error("Failed to insert school settings:", error);
      return { success: false, error: error.message };
    }
  }

  return { success: true };
}
