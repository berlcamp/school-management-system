/**
 * The three authoring tiers a TOS or an exam can sit in (migration 160).
 *
 *   division    — school_id IS NULL. Visible to every teacher in the division.
 *   school      — school_id set + is_school_shared. Visible to every teacher at
 *                 that school.
 *   private     — school_id set, not shared. Visible only to its author.
 *
 * Before 160 the middle tier did not exist and `school_id set` meant private,
 * which is why `is_school_shared` defaults to false: an existing row keeps
 * exactly the visibility it already had.
 */

export type ExamTier = "division" | "school" | "private";

/** A row shaped enough to place in a tier — `sms_tos` and `sms_exams` both fit. */
export interface TieredRow {
  school_id?: string | number | null;
  is_school_shared?: boolean | null;
}

export function examTier(row: TieredRow): ExamTier {
  if (row.school_id == null) return "division";
  return row.is_school_shared ? "school" : "private";
}

export const EXAM_TIER_LABEL: Record<ExamTier, string> = {
  division: "Division-wide",
  school: "School-wide",
  private: "Private to me",
};

export const EXAM_TIER_HINT: Record<ExamTier, string> = {
  division: "Shared with every teacher in the division.",
  school: "Shared with every teacher at your school.",
  private: "Only you can see this.",
};

/** The badge a list shows against a row that is not the reader's own. */
export const EXAM_TIER_BADGE_CLASS: Record<ExamTier, string> = {
  division: "bg-blue-100 text-blue-800",
  school: "bg-violet-100 text-violet-800",
  private: "bg-gray-100 text-gray-700",
};

/**
 * The PostgREST `.or()` filter for what a teacher-side list may show:
 * division rows, this school's shared rows, and the reader's own.
 *
 * The school clause is nested (`and(...)`) because both halves must hold — a
 * row shared at a *different* school must not appear. It is omitted entirely
 * when the reader has no school, which would otherwise render as
 * `school_id.eq.null` and match nothing useful.
 */
export function visibleTierFilter(
  userId: string | number | null,
  schoolId: string | number | null,
): string {
  const clauses = ["school_id.is.null"];
  if (schoolId != null) {
    clauses.push(`and(school_id.eq.${schoolId},is_school_shared.is.true)`);
  }
  if (userId != null) clauses.push(`created_by.eq.${userId}`);
  return clauses.join(",");
}

/**
 * Whether this reader may edit the row.
 *
 * The author always may. A school-wide row is additionally the school's, so its
 * school head / assistant / admin may — which is what makes the tier usable:
 * somebody has to be able to fix the school's own paper when its author is on
 * leave. Mirrors `can_manage_exam` in migration 161, which is the enforced copy.
 */
const SCHOOL_MANAGER_TYPES = ["school_head", "assistant_school_head", "admin"];

export function canManageTieredRow(
  row: TieredRow & { created_by?: string | number | null },
  reader: {
    userId: string | number | null;
    schoolId: string | number | null;
    type?: string | null;
  },
): boolean {
  if (reader.userId != null && String(row.created_by) === String(reader.userId))
    return true;
  return (
    examTier(row) === "school" &&
    reader.schoolId != null &&
    String(row.school_id) === String(reader.schoolId) &&
    SCHOOL_MANAGER_TYPES.includes(reader.type ?? "")
  );
}
