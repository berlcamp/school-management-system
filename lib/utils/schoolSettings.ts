import { supabase } from "@/lib/supabase/client";

export interface SchoolSettings {
  allow_edit_previous_school_year: boolean;
  promotion_deadline: string | null;
}

export const DEFAULT_SETTINGS: SchoolSettings = {
  allow_edit_previous_school_year: false,
  promotion_deadline: null,
};

interface SchoolSettingsRow {
  id: number;
  school_id: string | null;
  allow_edit_previous_school_year: boolean;
  promotion_deadline: string | null;
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
