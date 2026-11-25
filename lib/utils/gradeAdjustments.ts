// Reads and writes of final grade adjustments (migration 239).

import { supabase } from "@/lib/supabase/client";
import { termSlot, type AdjustmentStatus } from "@/lib/constants/gradeAdjustments";
import {
  adjustmentMap,
  type AdjustmentMap,
  type AdjustmentRow,
} from "@/lib/utils/finalPoints";

export const GRADE_ADJUSTMENTS_CHANGED = "sms:grade-adjustments-changed";

export const notifyGradeAdjustmentsChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GRADE_ADJUSTMENTS_CHANGED));
  }
};

const LEARNER_CHUNK = 200;
const PAGE_SIZE = 1000;

/** PostgREST's answers when the table is not there yet (239 not applied). */
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";

/**
 * Approved points of these learners. Before 239 is applied there are none.
 * Any other failure throws: a form must not print without points it should
 * carry.
 */
export async function fetchApprovedAdjustments(
  studentIds: (string | number)[],
  schoolYear?: string,
): Promise<AdjustmentMap> {
  const rows: AdjustmentRow[] = [];
  const ids = [...new Set(studentIds.map(Number))];
  for (let i = 0; i < ids.length; i += LEARNER_CHUNK) {
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from("sms_grade_adjustments")
        .select("student_id, subject_id, school_year, semester, points")
        .eq("status", "approved")
        .in("student_id", ids.slice(i, i + LEARNER_CHUNK));
      if (schoolYear) query = query.eq("school_year", schoolYear);
      const { data, error } = await query
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        if (isMissingTable(error.code)) return new Map();
        throw new Error(error.message);
      }
      rows.push(...((data ?? []) as AdjustmentRow[]));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return adjustmentMap(rows);
}

export interface SectionAdjustment extends AdjustmentRow {
  id: number;
  reason: string;
  note: string | null;
  status: AdjustmentStatus;
  requested_by: number | null;
  decision_remarks: string | null;
}

/**
 * Live and rejected requests of these subjects in one section, newest first;
 * null when 239 is not applied, so the caller offers no button.
 */
export async function fetchSectionAdjustments(
  sectionId: string,
  subjectIds: string[],
  schoolYear: string,
): Promise<SectionAdjustment[] | null> {
  const { data, error } = await supabase
    .from("sms_grade_adjustments")
    .select(
      "id, student_id, subject_id, school_year, semester, points, reason, note, status, requested_by, decision_remarks",
    )
    .eq("section_id", Number(sectionId))
    .eq("school_year", schoolYear)
    .in("subject_id", subjectIds.map(Number))
    .in("status", ["pending", "approved", "rejected"])
    .order("id", { ascending: false });
  if (error) {
    if (!isMissingTable(error.code)) throw new Error(error.message);
    return null;
  }
  return (data ?? []) as SectionAdjustment[];
}

/** Approved points on one term's grades (240): student id → points. */
export async function fetchTermPoints(
  sectionId: string,
  subjectId: string,
  schoolYear: string,
  period: number,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("sms_grade_adjustments")
    .select("student_id, points")
    .eq("section_id", Number(sectionId))
    .eq("subject_id", Number(subjectId))
    .eq("school_year", schoolYear)
    .eq("semester", termSlot(period))
    .eq("status", "approved");
  if (error) {
    if (!isMissingTable(error.code)) console.error("fetchTermPoints:", error);
    return {};
  }
  return Object.fromEntries(
    (data ?? []).map((r) => [String(r.student_id), Number(r.points)]),
  );
}

async function call(fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  notifyGradeAdjustmentsChanged();
}

export const requestAdjustment = (args: {
  studentId: string;
  subjectId: string;
  sectionId: string;
  semester: number;
  points: number;
  reason: string;
  note: string;
}) =>
  call("grade_adjustment_request", {
    p_student_id: Number(args.studentId),
    p_subject_id: Number(args.subjectId),
    p_section_id: Number(args.sectionId),
    p_semester: args.semester,
    p_points: args.points,
    p_reason: args.reason,
    p_note: args.note,
  });

export const withdrawAdjustment = (id: number) =>
  call("grade_adjustment_withdraw", { p_id: id });

export const decideAdjustment = (id: number, approve: boolean, remarks: string) =>
  call("grade_adjustment_decide", { p_id: id, p_approve: approve, p_remarks: remarks });

export const revokeAdjustment = (id: number, remarks: string) =>
  call("grade_adjustment_revoke", { p_id: id, p_remarks: remarks });

export interface AdjustmentListRow {
  id: number;
  student_name: string;
  subject_name: string;
  section_name: string;
  grade_level: number;
  school_year: string;
  semester: number;
  points: number;
  reason: string;
  note: string | null;
  base_final: number;
  current_final: number | null;
  status: AdjustmentStatus;
  requested_by: number | null;
  requester_name: string | null;
  requested_at: string;
  decider_name: string | null;
  decided_at: string | null;
  decision_remarks: string | null;
  revoker_name: string | null;
  revoked_at: string | null;
  revoke_remarks: string | null;
}

export async function fetchAdjustmentList(
  schoolId: string | number,
  pending: boolean,
): Promise<AdjustmentListRow[]> {
  const { data, error } = await supabase.rpc("grade_adjustment_list", {
    p_school_id: Number(schoolId),
    p_pending: pending,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdjustmentListRow[];
}

/** The menu badge; a failed count shows none rather than breaking the menu. */
export async function fetchPendingAdjustmentCount(
  schoolId: string | number,
): Promise<number> {
  const { data, error } = await supabase.rpc("grade_adjustment_pending_count", {
    p_school_id: Number(schoolId),
  });
  return error ? 0 : Number(data ?? 0);
}
