/**
 * "Change from Term 3" — handing a subject from one teacher to another part of
 * the way through the year (migration 222).
 *
 * Teacher A's rows are narrowed to the periods before the chosen one and
 * Teacher B's rows are inserted for the rest. PostgREST gives the browser no
 * transaction, so `runHandover` narrows first (which can only free slots) and
 * then inserts; if the insert is refused — typically by the conflict trigger —
 * A's rows are put back as they were.
 *
 * A term is never taken away from a teacher who has already encoded class
 * record scores in it: the scores belong to their class record
 * (`sms_class_records.teacher_id`), and the new teacher would open an empty
 * one. `fetchEncodedPeriods` is that check; the schedule form applies it to a
 * handover and to an edit that narrows a row or changes its teacher.
 */

import type { supabase as browserClient } from "@/lib/supabase/client";
import type { SubjectSchedule } from "@/types";
import {
  normaliseScheduleTerms,
  periodsBefore,
  periodsFrom,
  type ScheduleTermOption,
  type ScheduleTerms,
} from "@/lib/utils/scheduleTerms";

const SCHEDULES = "sms_subject_schedules";

/** The app's browser client (procurements schema); a type-only reference. */
export type ScheduleClient = typeof browserClient;

/** The periods a row applies to, spelled out (NULL = every period). */
function coveredPeriods(terms: ScheduleTerms | undefined, allPeriods: number[]): number[] {
  return terms == null ? [...allPeriods] : allPeriods.filter((p) => terms.includes(p));
}

/**
 * Split a row at `fromPeriod`: `narrowed` is what the current teacher keeps,
 * `handedOver` what the next one takes. NULL when either side would be empty —
 * there is nothing to hand over, or nothing left to keep.
 */
export function planHandover(
  sourceTerms: ScheduleTerms,
  fromPeriod: number,
  allPeriods: number[],
): { narrowed: ScheduleTerms; handedOver: ScheduleTerms } | null {
  const covered = coveredPeriods(sourceTerms, allPeriods);
  const kept = periodsBefore(fromPeriod, allPeriods).filter((p) => covered.includes(p));
  const given = periodsFrom(fromPeriod, allPeriods).filter((p) => covered.includes(p));
  if (kept.length === 0 || given.length === 0) return null;
  return {
    narrowed: normaliseScheduleTerms(kept, allPeriods),
    handedOver: normaliseScheduleTerms(given, allPeriods),
  };
}

/**
 * Display names for a set of periods: the option that is exactly this set
 * ("2nd Semester"), else the option holding each period, de-duplicated.
 */
export function schedulePeriodLabels(
  periods: number[],
  options: ScheduleTermOption[],
): string[] {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  const exact = options.find(
    (o) =>
      o.periods.length === sorted.length &&
      o.periods.every((p, i) => p === sorted[i]),
  );
  if (exact) return [exact.label];
  const labels = sorted.map(
    (p) => options.find((o) => o.periods.includes(p))?.label ?? `Period ${p}`,
  );
  return [...new Set(labels)];
}

export function encodedConflictMessage(
  teacherName: string,
  periodLabels: string[],
): string {
  return `${teacherName} has already encoded ${periodLabels.join(" and ")}. Move the scores or unpost first.`;
}

/**
 * Periods the teacher still holds for this subject and section through rows
 * other than the ones being changed — a subject on two time blocks keeps its
 * term through the block that is not edited, so that term is not lost.
 */
export function periodsKeptByOtherRows(
  rows: Pick<
    SubjectSchedule,
    "id" | "subject_id" | "section_id" | "school_year" | "teacher_id" | "grading_periods"
  >[],
  args: {
    excludeIds: Array<string | number>;
    subjectId: string | number;
    sectionId: string | number;
    schoolYear: string;
    teacherId: string | number;
    allPeriods: number[];
  },
): number[] {
  const excluded = new Set(args.excludeIds.map(String));
  const kept = new Set<number>();
  for (const row of rows) {
    if (
      excluded.has(String(row.id)) ||
      String(row.subject_id) !== String(args.subjectId) ||
      String(row.section_id) !== String(args.sectionId) ||
      row.school_year !== args.schoolYear ||
      row.teacher_id == null ||
      String(row.teacher_id) !== String(args.teacherId)
    ) {
      continue;
    }
    coveredPeriods(row.grading_periods, args.allPeriods).forEach((p) => kept.add(p));
  }
  return [...kept].sort((a, b) => a - b);
}

/**
 * Grading periods in which `teacherId` has a class record for this subject,
 * section and school year holding at least one entered score (raw_score not
 * NULL). Throws on a read error, so a failed check never reads as "nothing
 * encoded".
 */
export async function fetchEncodedPeriods(
  supabase: ScheduleClient,
  args: { subjectId: number; sectionId: number; schoolYear: string; teacherId: number },
): Promise<number[]> {
  const { data: records, error: recordsError } = await supabase
    .from("sms_class_records")
    .select("id, grading_period")
    .eq("subject_id", args.subjectId)
    .eq("section_id", args.sectionId)
    .eq("school_year", args.schoolYear)
    .eq("teacher_id", args.teacherId);
  if (recordsError) throw new Error(recordsError.message);
  const recordRows = (records ?? []) as { id: number; grading_period: number }[];
  if (recordRows.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("sms_class_record_items")
    .select("id, class_record_id")
    .in(
      "class_record_id",
      recordRows.map((r) => r.id),
    );
  if (itemsError) throw new Error(itemsError.message);
  const itemRows = (items ?? []) as { id: number; class_record_id: number }[];

  // One small probe per record (at most four) rather than every score of the
  // section, which could run past PostgREST's row cap and drop a period.
  const encoded = new Set<number>();
  for (const record of recordRows) {
    const itemIds = itemRows
      .filter((i) => String(i.class_record_id) === String(record.id))
      .map((i) => i.id);
    if (itemIds.length === 0) continue;
    const { data: scores, error: scoresError } = await supabase
      .from("sms_class_record_scores")
      .select("item_id")
      .in("item_id", itemIds)
      .not("raw_score", "is", null)
      .limit(1);
    if (scoresError) throw new Error(scoresError.message);
    if ((scores ?? []).length > 0) encoded.add(Number(record.grading_period));
  }
  return [...encoded].sort((a, b) => a - b);
}

type HandoverResult =
  | { ok: true; inserted: SubjectSchedule[] }
  | { ok: false; error: string };

/**
 * Narrow every source row to `narrowed`, then insert the new teacher's rows.
 * On any failure the sources already narrowed are put back to their own
 * original `grading_periods`, and the first error is returned.
 */
export async function runHandover(
  supabase: ScheduleClient,
  args: {
    sources: { id: number; grading_periods: ScheduleTerms }[];
    narrowed: ScheduleTerms;
    insertRows: Record<string, unknown>[];
    /** Added to every update, as the schedule form scopes its own writes. */
    schoolId?: string | number | null;
  },
): Promise<HandoverResult> {
  const setTerms = async (id: number, terms: ScheduleTerms): Promise<string | null> => {
    let query = supabase
      .from(SCHEDULES)
      .update({ grading_periods: terms })
      .eq("id", id);
    if (args.schoolId != null) query = query.eq("school_id", args.schoolId);
    const { data, error } = await query.select("id");
    if (error) return error.message;
    // RLS refuses an update by matching nothing, not by raising
    if (!data || data.length === 0) return "A schedule to change could not be updated.";
    return null;
  };

  const restore = async (done: { id: number; grading_periods: ScheduleTerms }[]) => {
    for (const source of done) await setTerms(source.id, source.grading_periods);
  };

  const narrowedSoFar: { id: number; grading_periods: ScheduleTerms }[] = [];
  for (const source of args.sources) {
    const error = await setTerms(source.id, args.narrowed);
    if (error) {
      await restore(narrowedSoFar);
      return { ok: false, error };
    }
    narrowedSoFar.push(source);
  }

  // One statement, so the new teacher's blocks go in or fail together
  const { data, error } = await supabase
    .from(SCHEDULES)
    .insert(args.insertRows)
    .select();
  if (error) {
    await restore(narrowedSoFar);
    return { ok: false, error: error.message };
  }
  return { ok: true, inserted: (data ?? []) as SubjectSchedule[] };
}
