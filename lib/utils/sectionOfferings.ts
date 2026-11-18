// Senior High subjects offered in some terms of a section only (migration 235).
//
// `sms_section_subject_terms` holds one row per (section, subject, school year)
// that is NOT offered the whole year; no row = the whole year. The final-grade
// rule itself lives in lib/utils/mapeh.ts (`offeredPeriods` on a row); the SQL
// twin is students_gpa_for_grade. This module only reads offerings and does the
// term arithmetic the Offered-in control and the term pickers share.

import { isOldShsCurriculum, isShsGrade } from "@/lib/constants/shs";
import { supabase } from "@/lib/supabase/client";
import { isTermBasedSchoolYear } from "@/lib/utils/schoolYear";

/**
 * Whether a section can have offerings at all: Grade 11-12, not on the old
 * (semestral) curriculum, in a term-based school year. Every reader checks this
 * before applying offerings, so a section later moved to the old curriculum
 * prints by its semester blocks, never by stale offering rows.
 */
export function offeringsApply(section: {
  gradeLevel: number | null | undefined;
  shsCurriculum: string | null | undefined;
  schoolYear: string;
}): boolean {
  return (
    isShsGrade(section.gradeLevel) &&
    !isOldShsCurriculum(section.shsCurriculum) &&
    isTermBasedSchoolYear(section.schoolYear)
  );
}

/** Sorted, distinct, inside 1…periodCount; null when it is the whole year. */
export function normaliseOfferedTerms(
  terms: number[],
  periodCount: number,
): number[] | null {
  const kept = [...new Set(terms)]
    .filter((t) => Number.isInteger(t) && t >= 1 && t <= periodCount)
    .sort((a, b) => a - b);
  return kept.length === 0 || kept.length === periodCount ? null : kept;
}

/**
 * A schedule row's terms narrowed to an offering (NULL row = whole year).
 * Null when nothing would be left — the save is refused then, never the row
 * deleted.
 */
export function narrowToOffering(
  rowTerms: number[] | null,
  offered: number[],
  periodCount: number,
): number[] | null {
  const from = rowTerms ?? Array.from({ length: periodCount }, (_, i) => i + 1);
  const kept = from.filter((t) => offered.includes(t)).sort((a, b) => a - b);
  return kept.length === 0 ? null : kept;
}

/** The section's offerings for a school year: subject id → offered terms. */
export async function fetchSectionOfferings(
  sectionId: string,
  schoolYear: string,
): Promise<Map<string, number[]>> {
  const { data, error } = await supabase
    .from("sms_section_subject_terms")
    .select("subject_id, terms")
    .eq("section_id", Number(sectionId))
    .eq("school_year", schoolYear);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((row) => [
      String(row.subject_id),
      ((row.terms as number[] | null) ?? []).map(Number),
    ]),
  );
}

/** A subject's offered terms, or null for the whole year. */
export function offeredFor(
  offerings: Map<string, number[]> | null | undefined,
  subjectId: string,
): number[] | null {
  return offerings?.get(String(subjectId)) ?? null;
}

// Pure, Supabase-free — importable from a server action.
export { withinOfferings, type OfferingRow } from "@/lib/utils/offeringFilter";
