/**
 * Kindergarten and Grade 1 on Grade Monitoring.
 *
 * Neither grade level has a Class Record or numeric grades, so the
 * learners-with-a-grade count the rest of the page runs on would read every
 * Kinder / Grade 1 subject as "Not started" forever. Instead each section gets
 * one row showing when its adviser last touched the instruments that grade
 * level does keep:
 *
 * - Kindergarten: ECCD checklist (047/059) and Kindergarten Progress Report
 *   ratings + term comments (172)
 * - Grade 1: PACE ratings (180/205) and the Learner's Progress Report
 *   narratives (180)
 *
 * Every one of those tables carries an `updated_at` trigger, so "last updated"
 * is the latest `updated_at` across them for the section and school year.
 * All but the ECCD checklist are keyed by term (1-3), which gives the per-term
 * badges; ECCD is rated per semester, which does not line up with terms, so it
 * counts toward the section's overall date only.
 * Clearing a rating DELETEs the row (172/180), which leaves no timestamp —
 * a removal alone does not move the date.
 */

import { supabase } from "@/lib/supabase/client";
import type { EncodingGridRow } from "./gradeEncoding";

export const EARLY_GRADE_LEVELS = [0, 1];

export function isEarlyGradeLevel(level: number): boolean {
  return EARLY_GRADE_LEVELS.includes(Number(level));
}

interface Source {
  table: string;
  label: string;
  /** Has a `term` column (1-3); ECCD is per semester instead. */
  termKeyed: boolean;
}

const SOURCES: Record<number, Source[]> = {
  0: [
    { table: "sms_eccd_assessments", label: "ECCD Checklist", termKeyed: false },
    { table: "sms_kinder_progress_ratings", label: "Progress Report", termKeyed: true },
    { table: "sms_kinder_progress_remarks", label: "Progress Report", termKeyed: true },
  ],
  1: [
    { table: "sms_pace_ratings", label: "PACE", termKeyed: true },
    { table: "sms_grade1_progress_narratives", label: "Progress Report", termKeyed: true },
  ],
};

const TERMS = [1, 2, 3];

export function earlyGradeWorkbookLabel(level: number): string {
  return Array.from(new Set((SOURCES[level] ?? []).map((s) => s.label))).join(
    " & ",
  );
}

export interface EarlyGradeSection {
  id: string;
  name: string;
  grade_level: number;
  adviserName: string | null;
}

export interface ActivityStamp {
  updatedAt: string | null;
  /** Which instrument carries that latest change. */
  source: string | null;
}

export interface EarlyGradeActivity extends ActivityStamp {
  /** Latest change per term (1-3), from the term-keyed instruments only. */
  byTerm: Record<number, ActivityStamp>;
}

const EMPTY_STAMP: ActivityStamp = { updatedAt: null, source: null };

function latestOf(stamps: ActivityStamp[]): ActivityStamp {
  let best = EMPTY_STAMP;
  for (const entry of stamps) {
    if (
      entry.updatedAt &&
      (!best.updatedAt || new Date(entry.updatedAt) > new Date(best.updatedAt))
    ) {
      best = entry;
    }
  }
  return best;
}

/**
 * Latest update per section and term. One `limit 1` query per section, table
 * and term (each served by the tables' `(section_id, school_year, term)`
 * index) keeps the payload tiny — a single Grade 1 section can hold tens of thousands of
 * PACE rating rows, which are not worth downloading to read one timestamp.
 */
export async function fetchEarlyGradeActivity(
  sections: EarlyGradeSection[],
  schoolYear: string,
): Promise<Map<string, EarlyGradeActivity>> {
  const result = new Map<string, EarlyGradeActivity>();

  await Promise.all(
    sections.map(async (section) => {
      const sources = SOURCES[section.grade_level] ?? [];
      const lookups = sources.flatMap((source) =>
        source.termKeyed
          ? TERMS.map((term) => ({ source, term }))
          : [{ source, term: null as number | null }],
      );
      const stamps = await Promise.all(
        lookups.map(async ({ source, term }) => {
          let query = supabase
            .from(source.table)
            .select("updated_at")
            .eq("section_id", Number(section.id))
            .eq("school_year", schoolYear);
          if (term !== null) query = query.eq("term", term);
          const { data, error } = await query
            .order("updated_at", { ascending: false })
            .limit(1);
          if (error) throw error;
          const updatedAt =
            (data?.[0] as { updated_at: string } | undefined)?.updated_at ??
            null;
          return { term, stamp: { updatedAt, source: source.label } };
        }),
      );

      const byTerm: Record<number, ActivityStamp> = {};
      for (const term of TERMS) {
        byTerm[term] = latestOf(
          stamps.filter((s) => s.term === term).map((s) => s.stamp),
        );
      }
      result.set(section.id, {
        ...latestOf(stamps.map((s) => s.stamp)),
        byTerm,
      });
    }),
  );

  return result;
}

/** One grid row per Kinder / Grade 1 section, in place of its subject rows. */
export function toEarlyGradeRows(
  sections: EarlyGradeSection[],
  activity: Map<string, EarlyGradeActivity>,
): EncodingGridRow[] {
  return sections.map((section) => {
    const entry = activity.get(section.id) ?? { ...EMPTY_STAMP, byTerm: {} };
    return {
      key: `early__${section.id}`,
      subjectName: earlyGradeWorkbookLabel(section.grade_level),
      program: "regular",
      sectionName: section.name,
      gradeLevel: section.grade_level,
      assignedTeachers: section.adviserName ? [section.adviserName] : [],
      encoders: [],
      lastEncodedAt: entry.updatedAt,
      periods: {},
      workbook: entry,
    };
  });
}
