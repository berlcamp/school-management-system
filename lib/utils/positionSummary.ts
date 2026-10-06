/**
 * Staff by Position / Designation — a headcount of active personnel per
 * `sms_users.position`, by sex, at one school or across the division.
 *
 * `position` is free TEXT and was typed by hand before /staff offered a
 * dropdown, so "TEACHER III", "Teacher-3" and "Teacher III" are one position:
 * the listed teacher positions are matched through `matchTeacherPosition()`
 * (the dropdown's own matcher), and anything else is grouped ignoring case and
 * spacing, printed in its most common spelling. Blank is "Not specified" and
 * sorts last, so the gap in the records is visible rather than dropped.
 *
 * Membership is the personnel record, not the role: every active school-level
 * account counts, including the login-disabled ones (accounting, security
 * guard, utility worker), which are on the plantilla precisely to be counted.
 * Division-office roles are excluded, as in 071's personnel summaries.
 * `school_id` is the active school (134), matching every other staff report.
 *
 * No RPC: 001's SELECT policy lets any authenticated user read `sms_users`,
 * so the division office already reads every school's staff directly.
 */

import {
  DIVISION_USER_TYPES,
  NON_STAFF_USER_TYPES,
  TEACHER_POSITIONS,
  matchTeacherPosition,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";

export const NOT_SPECIFIED = "Not specified";

export interface PositionStaff {
  id: number;
  name: string;
  gender: string | null;
  position: string | null;
  type: string | null;
  school_id: number;
  school_name: string;
}

export interface PositionCounts {
  male: number;
  female: number;
  /** Sex not recorded on the staff record. */
  unrecorded: number;
  total: number;
}

export interface PositionGroup extends PositionCounts {
  label: string;
  /** One of the listed plantilla teacher positions. */
  teaching: boolean;
  /** Sorted by school, then name. */
  staff: PositionStaff[];
}

export interface PositionSummary extends PositionCounts {
  groups: PositionGroup[];
  schoolCount: number;
}

export interface PositionSchoolRow extends PositionCounts {
  schoolId: number;
  schoolName: string;
}

const emptyCounts = (): PositionCounts => ({
  male: 0,
  female: 0,
  unrecorded: 0,
  total: 0,
});

function tally(counts: PositionCounts, gender: string | null): void {
  if (gender === "male") counts.male += 1;
  else if (gender === "female") counts.female += 1;
  else counts.unrecorded += 1;
  counts.total += 1;
}

function cleanPosition(position: string | null): string {
  return (position ?? "").replace(/\s+/g, " ").trim();
}

/** Listed teacher positions in plantilla order, then A–Z, "Not specified" last. */
function comparePositions(a: PositionGroup, b: PositionGroup): number {
  const rank = (g: PositionGroup) =>
    g.label === NOT_SPECIFIED
      ? Number.MAX_SAFE_INTEGER
      : g.teaching
        ? TEACHER_POSITIONS.indexOf(g.label)
        : TEACHER_POSITIONS.length;
  return rank(a) - rank(b) || a.label.localeCompare(b.label);
}

export function buildPositionSummary(staff: PositionStaff[]): PositionSummary {
  const groups = new Map<
    string,
    { group: PositionGroup; spellings: Map<string, number> }
  >();

  for (const person of staff) {
    const typed = cleanPosition(person.position);
    const listed = matchTeacherPosition(typed);
    const label = listed ?? (typed || NOT_SPECIFIED);
    const key = listed ?? (typed ? typed.toUpperCase() : NOT_SPECIFIED);

    let entry = groups.get(key);
    if (!entry) {
      entry = {
        group: {
          ...emptyCounts(),
          label,
          teaching: listed !== null,
          staff: [],
        },
        spellings: new Map(),
      };
      groups.set(key, entry);
    }
    tally(entry.group, person.gender);
    entry.group.staff.push(person);
    entry.spellings.set(label, (entry.spellings.get(label) ?? 0) + 1);
  }

  const result = Array.from(groups.values()).map(({ group, spellings }) => {
    // A free-typed position prints in the spelling most people used for it.
    if (!group.teaching && group.label !== NOT_SPECIFIED) {
      group.label = Array.from(spellings.entries()).sort(
        ([a, x], [b, y]) => y - x || a.localeCompare(b),
      )[0][0];
    }
    group.staff.sort(
      (a, b) =>
        a.school_name.localeCompare(b.school_name) ||
        a.name.localeCompare(b.name),
    );
    return group;
  });
  result.sort(comparePositions);

  const totals = emptyCounts();
  for (const person of staff) tally(totals, person.gender);

  return {
    ...totals,
    groups: result,
    schoolCount: new Set(staff.map((s) => s.school_id)).size,
  };
}

/** One position's headcount split per school, for the division drill-down. */
export function positionSchoolRows(group: PositionGroup): PositionSchoolRow[] {
  const bySchool = new Map<number, PositionSchoolRow>();
  for (const person of group.staff) {
    let row = bySchool.get(person.school_id);
    if (!row) {
      row = {
        ...emptyCounts(),
        schoolId: person.school_id,
        schoolName: person.school_name,
      };
      bySchool.set(person.school_id, row);
    }
    tally(row, person.gender);
  }
  return Array.from(bySchool.values()).sort((a, b) =>
    a.schoolName.localeCompare(b.schoolName),
  );
}

const PAGE = 1000;

/** Active staff of one school, or of every active school when `schoolId` is null. */
export async function fetchPositionStaff(
  schoolId: string | number | null,
): Promise<PositionStaff[]> {
  let schoolQuery = supabase
    .from("sms_schools")
    .select("id, name")
    .eq("is_active", true);
  if (schoolId !== null) schoolQuery = schoolQuery.eq("id", Number(schoolId));
  const { data: schools, error: schoolError } = await schoolQuery;
  if (schoolError) throw new Error(schoolError.message);

  const schoolNames = new Map<number, string>(
    (schools ?? []).map((s) => [Number(s.id), s.name as string]),
  );
  if (schoolNames.size === 0) return [];

  // Division roles oversee every school; a pure ARAL tutor logs in at one but
  // is not personnel. Neither is on a school's roster.
  const excluded = `(${[...DIVISION_USER_TYPES, ...NON_STAFF_USER_TYPES]
    .map((t) => `"${t}"`)
    .join(",")})`;
  const staff: PositionStaff[] = [];

  // PostgREST caps a response at 1,000 rows; a division's staff exceeds that.
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("sms_users")
      .select("id, name, gender, position, type, school_id")
      .eq("is_active", true)
      .not("school_id", "is", null)
      .not("type", "in", excluded)
      .order("id")
      .range(from, from + PAGE - 1);
    if (schoolId !== null) query = query.eq("school_id", Number(schoolId));

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    for (const u of data ?? []) {
      const sid = Number(u.school_id);
      const schoolName = schoolNames.get(sid);
      if (schoolName === undefined) continue; // inactive school
      staff.push({
        id: Number(u.id),
        name: (u.name as string) ?? "",
        gender: (u.gender as string | null) ?? null,
        position: (u.position as string | null) ?? null,
        type: (u.type as string | null) ?? null,
        school_id: sid,
        school_name: schoolName,
      });
    }
    if ((data?.length ?? 0) < PAGE) break;
  }

  return staff;
}

export const POSITION_EXPORT_HEADERS = [
  "Position / Designation",
  "Male",
  "Female",
  "Sex Not Recorded",
  "Total",
] as const;

export function positionExportRows(
  summary: PositionSummary,
): Record<string, string | number>[] {
  const row = (label: string, c: PositionCounts) => ({
    "Position / Designation": label,
    Male: c.male,
    Female: c.female,
    "Sex Not Recorded": c.unrecorded,
    Total: c.total,
  });
  return [
    ...summary.groups.map((g) => row(g.label, g)),
    row("TOTAL", summary),
  ];
}
