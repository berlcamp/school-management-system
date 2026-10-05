/**
 * Employee Specialization report (migration 198): who holds which
 * undergraduate major, graduate major and DepEd specialization, by sex, at one
 * school or division-wide, plus who has not answered.
 *
 * Same membership as Staff by Position (lib/utils/positionSummary.ts): active
 * school-level accounts, division-office roles excluded, `school_id` = active
 * school (134). No RPC: 001's SELECT policy lets any authenticated user read
 * `sms_users`.
 */

import {
  DIVISION_USER_TYPES,
  GRADUATE_MAJORS,
  LEARNING_AREAS,
  MajorOption,
  OTHER_CODE,
  UNDERGRAD_MAJORS,
  getLearningAreaLabel,
  majorGroupCode,
  majorLabel,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";

export type SpecializationPart = "undergrad" | "graduate" | "work";

export const SPECIALIZATION_PARTS: { key: SpecializationPart; title: string }[] = [
  { key: "undergrad", title: "Major in College (Undergraduate)" },
  { key: "graduate", title: "Major in Graduate School" },
  { key: "work", title: "Specialization at DepEd" },
];

export const NOT_ANSWERED_CODE = "__none";
const NOT_ANSWERED_LABEL = "Not yet answered";

export interface SpecializationStaff {
  id: number;
  name: string;
  gender: string | null;
  type: string | null;
  school_id: number;
  school_name: string;
  undergrad_major: string | null;
  graduate_major: string | null;
  learning_area: string | null;
}

export interface SpecializationCountRow {
  code: string;
  label: string;
  male: number;
  female: number;
  unrecorded: number;
  total: number;
}

const WORK_OPTIONS: MajorOption[] = LEARNING_AREAS.map((a) => ({
  code: a.code,
  label: a.label,
  group: "",
}));

function optionsFor(part: SpecializationPart): readonly MajorOption[] {
  return part === "undergrad"
    ? UNDERGRAD_MAJORS
    : part === "graduate"
      ? GRADUATE_MAJORS
      : WORK_OPTIONS;
}

function rawValue(part: SpecializationPart, p: SpecializationStaff): string | null {
  return part === "undergrad"
    ? p.undergrad_major
    : part === "graduate"
      ? p.graduate_major
      : p.learning_area;
}

export function partLabel(part: SpecializationPart, p: SpecializationStaff): string {
  const value = rawValue(part, p);
  if (part === "work") return value ? getLearningAreaLabel(value) : "—";
  return majorLabel(optionsFor(part), value);
}

export function isIncomplete(p: SpecializationStaff): boolean {
  return !p.undergrad_major || !p.graduate_major || !p.learning_area;
}

export function buildSpecializationCounts(
  staff: SpecializationStaff[],
  part: SpecializationPart,
): SpecializationCountRow[] {
  const options = optionsFor(part);
  const rows = new Map<string, SpecializationCountRow>();

  for (const p of staff) {
    const code = majorGroupCode(rawValue(part, p)) ?? NOT_ANSWERED_CODE;
    let row = rows.get(code);
    if (!row) {
      const listed = options.find((o) => o.code === code);
      row = {
        code,
        label:
          code === NOT_ANSWERED_CODE
            ? NOT_ANSWERED_LABEL
            : code === OTHER_CODE
              ? "Other"
              : (listed?.label ?? code),
        male: 0,
        female: 0,
        unrecorded: 0,
        total: 0,
      };
      rows.set(code, row);
    }
    if (p.gender === "male") row.male += 1;
    else if (p.gender === "female") row.female += 1;
    else row.unrecorded += 1;
    row.total += 1;
  }

  // List order; an unlisted stored code just before Other; Other, then unanswered, last.
  const rank = (code: string): number => {
    if (code === NOT_ANSWERED_CODE) return options.length + 2;
    if (code === OTHER_CODE) return options.length + 1;
    const i = options.findIndex((o) => o.code === code);
    return i === -1 ? options.length : i;
  };
  return Array.from(rows.values()).sort(
    (a, b) => rank(a.code) - rank(b.code) || a.label.localeCompare(b.label),
  );
}

const sexWord = (g: string | null) =>
  g === "male" ? "Male" : g === "female" ? "Female" : "";

export function specializationExportRows(
  staff: SpecializationStaff[],
  divisionWide: boolean,
): Record<string, string>[] {
  return staff.map((p) => ({
    ...(divisionWide ? { School: p.school_name } : {}),
    Name: p.name,
    Sex: sexWord(p.gender),
    "Major in College": partLabel("undergrad", p).replace(/^—$/, ""),
    "Major in Graduate School": partLabel("graduate", p).replace(/^—$/, ""),
    "Specialization at DepEd": partLabel("work", p).replace(/^—$/, ""),
  }));
}

const PAGE = 1000;

export async function fetchSpecializationStaff(
  schoolId: string | number | null,
): Promise<SpecializationStaff[]> {
  let schoolQuery = supabase.from("sms_schools").select("id, name").eq("is_active", true);
  if (schoolId !== null) schoolQuery = schoolQuery.eq("id", Number(schoolId));
  const { data: schools, error: schoolError } = await schoolQuery;
  if (schoolError) throw new Error(schoolError.message);
  const schoolNames = new Map<number, string>(
    (schools ?? []).map((s) => [Number(s.id), s.name as string]),
  );
  if (schoolNames.size === 0) return [];

  const excluded = `(${DIVISION_USER_TYPES.map((t) => `"${t}"`).join(",")})`;
  const staff: SpecializationStaff[] = [];

  // PostgREST caps a response at 1,000 rows; a division's staff exceeds that.
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("sms_users")
      .select("id, name, gender, type, school_id, undergrad_major, graduate_major, learning_area")
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
        type: (u.type as string | null) ?? null,
        school_id: sid,
        school_name: schoolName,
        undergrad_major: (u.undergrad_major as string | null) ?? null,
        graduate_major: (u.graduate_major as string | null) ?? null,
        learning_area: (u.learning_area as string | null) ?? null,
      });
    }
    if (!data || data.length < PAGE) break;
  }

  return staff.sort(
    (a, b) => a.school_name.localeCompare(b.school_name) || a.name.localeCompare(b.name),
  );
}
