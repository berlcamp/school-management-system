import { beforeEach, describe, expect, it, vi } from "vitest";

/* Fake PostgREST builder with the calls fetchSectionGrades makes
   (eq / in / order / range); resolves to the rows registered per table. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function builder(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  let window: [number, number] | null = null;
  const apply = () => {
    const rows = (tables[table] ?? []).filter((row) =>
      filters.every(([op, col, val]) =>
        op === "eq"
          ? String(row[col]) === String(val)
          : (val as unknown[]).map(String).includes(String(row[col])),
      ),
    );
    return window ? rows.slice(window[0], window[1] + 1) : rows;
  };
  const b = {
    select: () => b,
    order: () => b,
    eq: (col: string, val: unknown) => {
      filters.push(["eq", col, val]);
      return b;
    },
    in: (col: string, val: unknown[]) => {
      filters.push(["in", col, val]);
      return b;
    },
    range: (from: number, to: number) => {
      window = [from, to];
      return b;
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: apply(), error: null }).then(resolve),
  };
  return b;
}

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));

import { fetchSectionGrades, sectionGradeKey } from "@/lib/utils/sectionGrades";

const math = { id: "11", code: "MATH7", name: "Mathematics 7" };
const grade = (student: number, section: number, period: number, value: number) => ({
  student_id: student,
  section_id: section,
  school_year: "2026-2027",
  subject_id: 11,
  grading_period: period,
  grade: value,
  subject: math,
});

describe("fetchSectionGrades across a mid-year move", () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    tables.sms_sections = [
      { id: 5, school_id: 1, school_year: "2026-2027", grade_level: 7 },
      { id: 7, school_id: 1, school_year: "2026-2027", grade_level: 7 },
    ];
    tables.sms_grades = [
      grade(3, 5, 1, 80), // learner 3 sat Q1 in section 5, then moved to 7
      grade(3, 7, 2, 88),
      grade(4, 5, 1, 99), // learner 4 is still in section 5
    ];
  });

  it("without options it reads only the section, as before", async () => {
    const out = await fetchSectionGrades("7", "2026-2027", [math], [1, 2, 3]);
    expect(out.periodsByCell.get(sectionGradeKey("3", "11"))).toEqual({ 2: 88 });
  });

  it("with the section's learners it adds their earlier section's quarters", async () => {
    const out = await fetchSectionGrades("7", "2026-2027", [math], [1, 2, 3], {
      learnerIds: ["3"],
    });
    expect(out.periodsByCell.get(sectionGradeKey("3", "11"))).toEqual({ 1: 80, 2: 88 });
    // A learner who is not in this section is never pulled in.
    expect(out.periodsByCell.has(sectionGradeKey("4", "11"))).toBe(false);
  });
});

describe("fetchSectionGrades in Senior High", () => {
  it("does not add the other semester's section", async () => {
    tables.sms_sections = [
      { id: 21, school_id: 1, school_year: "2026-2027", grade_level: 11 },
      { id: 22, school_id: 1, school_year: "2026-2027", grade_level: 11 },
    ];
    tables.sms_grades = [
      { ...grade(3, 21, 1, 80), subject_id: 31 },
      { ...grade(3, 22, 3, 90), subject_id: 32 },
    ];
    const out = await fetchSectionGrades("22", "2026-2027", [], [1, 2, 3, 4], {
      learnerIds: ["3"],
    });
    expect(out.periodsByCell.has(sectionGradeKey("3", "31"))).toBe(false);
    expect(out.periodsByCell.get(sectionGradeKey("3", "32"))).toEqual({ 3: 90 });
  });
});
