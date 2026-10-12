import { supabase } from "@/lib/supabase/client";

/**
 * Term dates (migration 205): the first day of Terms 2 and 3 for a school
 * year. A school's own row takes precedence over the division-wide one
 * (NULL `school_id`, per the 106/118/125 convention).
 *
 * Read wherever a month has to be split by term — today the Grade 1 card's
 * attendance record, which the issued workbook prints with September twice.
 */
export interface TermDates {
  term2_start: string;
  term3_start: string;
}

export interface TermDatesRow extends TermDates {
  id: string;
  school_id: string | null;
  school_year: string;
}

/** Both rows that could apply: the school's own and the division's. */
export async function fetchTermDateRows(
  schoolId: string | number | null | undefined,
  schoolYear: string,
): Promise<{ school: TermDatesRow | null; division: TermDatesRow | null }> {
  let query = supabase
    .from("sms_school_term_dates")
    .select("id, school_id, school_year, term2_start, term3_start")
    .eq("school_year", schoolYear);
  query =
    schoolId == null
      ? query.is("school_id", null)
      : query.or(`school_id.is.null,school_id.eq.${Number(schoolId)}`);

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch term dates:", error);
    return { school: null, division: null };
  }
  const rows = (data ?? []) as TermDatesRow[];
  return {
    school: rows.find((r) => r.school_id != null) ?? null,
    division: rows.find((r) => r.school_id == null) ?? null,
  };
}

/** The term dates in effect for a school, or null when none are set. */
export async function fetchTermDates(
  schoolId: string | number | null | undefined,
  schoolYear: string,
): Promise<TermDates | null> {
  const { school, division } = await fetchTermDateRows(schoolId, schoolYear);
  const row = school ?? division;
  return row ? { term2_start: row.term2_start, term3_start: row.term3_start } : null;
}
