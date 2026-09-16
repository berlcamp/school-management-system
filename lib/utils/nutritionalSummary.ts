/**
 * School-wide nutritional status, consolidated from SF8.
 *
 * SF8 itself is a section's sheet; this is the same counts across every section
 * of a school year, which is what the feeding programme coordinator files with
 * the division. Shared by the report page and its printable so the screen and
 * the paper cannot disagree.
 *
 * Both of the school year's readings are returned side by side — the baseline
 * taken at the beginning of the year and the endline at the end (migration
 * 188). Nothing is derived beyond the counts: whether a learner "improved" is
 * a judgement the form does not ask this system to make.
 */

import { supabase } from "@/lib/supabase/client";
import {
  HEIGHT_FOR_AGE_OPTIONS,
  NUTRITIONAL_STATUS_OPTIONS,
  type HealthMeasurementPeriod,
} from "@/lib/utils/nutritionalStatus";

/** Male and female counts for one band, in one grade level, at one reading. */
export interface SexCounts {
  male: number;
  female: number;
}

export type BandCounts = Record<string, SexCounts>;

export interface NutritionalSummaryRow {
  gradeLevel: number;
  /** Keyed by band value, e.g. `severely_wasted`. */
  bmi: BandCounts;
  hfa: BandCounts;
  /** Learners carrying a reading at all, which is the sheet's denominator. */
  measured: SexCounts;
}

export type NutritionalSummary = Record<
  HealthMeasurementPeriod,
  NutritionalSummaryRow[]
>;

export const BMI_BANDS = NUTRITIONAL_STATUS_OPTIONS;
export const HFA_BANDS = HEIGHT_FOR_AGE_OPTIONS;

const emptyCounts = (): SexCounts => ({ male: 0, female: 0 });

/**
 * Anything not recorded as female is counted as male, matching how the other
 * DepEd forms here split a roster that has only the two columns.
 */
function sexKey(gender: string | null | undefined): keyof SexCounts {
  return String(gender ?? "").toLowerCase().startsWith("f") ? "female" : "male";
}

/** `.in()` builds a URL, so a school's worth of ids goes in batches. */
async function fetchGenders(ids: number[]): Promise<Map<string, string | null>> {
  const genders = new Map<string, string | null>();
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase
      .from("sms_students")
      .select("id, gender")
      .in("id", ids.slice(i, i + CHUNK));
    (data || []).forEach((s: { id: number; gender: string | null }) => {
      genders.set(String(s.id), s.gender);
    });
  }
  return genders;
}

export async function fetchNutritionalSummary(
  schoolId: string,
  schoolYear: string,
): Promise<NutritionalSummary> {
  const empty: NutritionalSummary = { baseline: [], endline: [] };

  // The grade level of a reading is the grade level of the section it was taken
  // in — sms_learner_health has no school_id of its own, exactly as 112's
  // src_autofill resolves it.
  const { data: sections } = await supabase
    .from("sms_sections")
    .select("id, grade_level")
    .eq("school_id", schoolId)
    .eq("school_year", schoolYear)
    .eq("is_active", true);

  if (!sections || sections.length === 0) return empty;

  const gradeBySection = new Map<string, number>(
    sections.map((s: { id: number; grade_level: number }) => [
      String(s.id),
      Number(s.grade_level),
    ]),
  );

  const { data: records } = await supabase
    .from("sms_learner_health")
    .select(
      "student_id, section_id, nutritional_status, height_for_age, measurement_period",
    )
    .in("section_id", Array.from(gradeBySection.keys()))
    .eq("school_year", schoolYear);

  if (!records || records.length === 0) return empty;

  const genders = await fetchGenders(
    Array.from(new Set(records.map((r) => Number(r.student_id)))),
  );

  // grade level -> row, per period.
  const byPeriod: Record<HealthMeasurementPeriod, Map<number, NutritionalSummaryRow>> =
    { baseline: new Map(), endline: new Map() };

  records.forEach((rec) => {
    const gradeLevel = gradeBySection.get(String(rec.section_id));
    if (gradeLevel === undefined) return;

    // A reading whose period the database does not name is a baseline: every
    // row predating migration 188 is one.
    const period: HealthMeasurementPeriod =
      rec.measurement_period === "endline" ? "endline" : "baseline";
    const rows = byPeriod[period];

    let row = rows.get(gradeLevel);
    if (!row) {
      row = { gradeLevel, bmi: {}, hfa: {}, measured: emptyCounts() };
      rows.set(gradeLevel, row);
    }

    const sex = sexKey(genders.get(String(rec.student_id)));

    // A learner counts toward "measured" once they carry either band — a row
    // with a height and weight but no band yet is not a measurement anyone can
    // report, and counting it would make the bands fail to sum to the total.
    if (rec.nutritional_status || rec.height_for_age) {
      row.measured[sex] += 1;
    }
    if (rec.nutritional_status) {
      row.bmi[rec.nutritional_status] ??= emptyCounts();
      row.bmi[rec.nutritional_status][sex] += 1;
    }
    if (rec.height_for_age) {
      row.hfa[rec.height_for_age] ??= emptyCounts();
      row.hfa[rec.height_for_age][sex] += 1;
    }
  });

  const sorted = (rows: Map<number, NutritionalSummaryRow>) =>
    Array.from(rows.values()).sort((a, b) => a.gradeLevel - b.gradeLevel);

  return { baseline: sorted(byPeriod.baseline), endline: sorted(byPeriod.endline) };
}

/** Column totals across every grade level, for the TOTAL row. */
export function totalsFor(
  rows: NutritionalSummaryRow[],
  measure: "bmi" | "hfa",
): { bands: BandCounts; measured: SexCounts } {
  const bands: BandCounts = {};
  const measured = emptyCounts();
  rows.forEach((row) => {
    measured.male += row.measured.male;
    measured.female += row.measured.female;
    Object.entries(row[measure]).forEach(([band, counts]) => {
      bands[band] ??= emptyCounts();
      bands[band].male += counts.male;
      bands[band].female += counts.female;
    });
  });
  return { bands, measured };
}
