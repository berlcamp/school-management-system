/**
 * Movement remarks for the DepEd register forms (SF1, SF2).
 *
 * SF1 and SF2 are *registers*: a learner who transferred out or dropped stays
 * on the page and is annotated, rather than being filtered off it the way a
 * class list, SF8 or a headcount does. SF2's own printed legend says so —
 * "If TRANSFERRED IN/OUT, write the name of School." — and SF1 is the register
 * the rest of the year's forms are reconciled against.
 *
 * The wording lives here, in one place, so the two forms cannot drift: a
 * learner annotated "Transferred out to X on Y" on SF1 must read the same on
 * SF2 for the same month.
 *
 * Columns come from migrations 052 (`transfer_destination_school_id`,
 * `transfer_date`) and the NLIS drop metadata (`date_dropped`); `origin_school_id`
 * is what migration 066's transfer flow sets on the destination enrollment and
 * what SF4 already counts a transfer-in by, so the two agree by construction.
 */

import { supabase } from "@/lib/supabase/client";

/**
 * The columns `movementRemark` reads. Spread into a `.select()` so a caller
 * cannot ask for the remark without having fetched what it needs.
 */
export const MOVEMENT_SELECT =
  "student_id, enrollment_status, transfer_date, transfer_destination_school_id, origin_school_id, date_dropped, remarks";

export interface MovementRow {
  student_id: string | number;
  enrollment_status?: string | null;
  transfer_date?: string | null;
  transfer_destination_school_id?: string | number | null;
  origin_school_id?: string | number | null;
  date_dropped?: string | null;
  remarks?: string | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
}

/**
 * Names for every school named by a transfer on these rows, keyed by id as a
 * string. Returns an empty map when no row carries a transfer, so the common
 * case costs no query.
 */
export async function fetchMovementSchoolNames(
  rows: MovementRow[],
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  rows.forEach((r) => {
    if (r.transfer_destination_school_id != null)
      ids.add(String(r.transfer_destination_school_id));
    if (r.origin_school_id != null) ids.add(String(r.origin_school_id));
  });
  if (ids.size === 0) return new Map();

  const { data } = await supabase
    .from("sms_schools")
    .select("id, name")
    .in("id", Array.from(ids));

  return new Map((data || []).map((s) => [String(s.id), s.name as string]));
}

/**
 * The register's Remarks cell for one enrollment — "" when the learner simply
 * stayed put, which is most of them.
 *
 * A transfer OUT wins over a transfer IN when a learner did both in one year:
 * the register is read to find out where the learner is now, and they are no
 * longer here. The enrollment's own free-text `remarks` is appended rather
 * than replaced, since that is where a drop's reason is recorded.
 */
export function movementRemark(
  row: MovementRow,
  schoolNames: Map<string, string>,
): string {
  const parts: string[] = [];
  const status = row.enrollment_status || "active";
  const nameOf = (id: string | number | null | undefined) =>
    id == null ? "" : schoolNames.get(String(id)) || "";

  if (status === "transferred_out") {
    const school = nameOf(row.transfer_destination_school_id);
    const on = formatDate(row.transfer_date);
    parts.push(
      `Transferred out${school ? ` to ${school}` : ""}${on ? ` on ${on}` : ""}`,
    );
  } else if (status === "dropped") {
    const on = formatDate(row.date_dropped);
    parts.push(`Dropped out${on ? ` on ${on}` : ""}`);
  } else if (row.origin_school_id != null) {
    const school = nameOf(row.origin_school_id);
    parts.push(`Transferred in${school ? ` from ${school}` : ""}`);
  }

  const own = row.remarks?.trim();
  if (own) parts.push(own);

  return parts.join(" — ");
}
