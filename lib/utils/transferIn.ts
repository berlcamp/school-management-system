/**
 * Transfer-in learners (migration 200).
 *
 * A learner is a transferee when their enrollment names the school they came
 * from: `origin_school_id` for a school in the system (migration 066), or
 * `transfer_in_school_name` for one outside it — a private school, a school
 * in another division. Their grades from before the transfer are carried in
 * from the previous SF9 as `sms_grades` rows marked `carried_from_school`.
 */

export interface TransferInRow {
  origin_school_id?: string | number | null;
  transfer_in_school_name?: string | null;
}

export function isTransferee(row: TransferInRow): boolean {
  return row.origin_school_id != null || !!row.transfer_in_school_name?.trim();
}

/** The name of the school the learner transferred in from, or null. */
export function transferInSchool(
  row: TransferInRow,
  schoolNames: Map<string, string>,
): string | null {
  if (row.origin_school_id != null) {
    return schoolNames.get(String(row.origin_school_id)) || "another school";
  }
  return row.transfer_in_school_name?.trim() || null;
}

export type CarriedGradeParse =
  | { ok: true; grade: number | null }
  | { ok: false; error: string };

/**
 * One cell of the carried-grades grid. Blank means "no carried grade". The
 * rule matches `save_transfer_in_grades`: a whole number from 60 to 100.
 */
export function parseCarriedGrade(input: string): CarriedGradeParse {
  const v = input.trim();
  if (v === "") return { ok: true, grade: null };
  if (!/^\d{1,3}$/.test(v)) {
    return { ok: false, error: "Enter a whole number from 60 to 100" };
  }
  const n = Number(v);
  if (n < 60 || n > 100) {
    return { ok: false, error: "Enter a whole number from 60 to 100" };
  }
  return { ok: true, grade: n };
}
