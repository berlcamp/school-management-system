import { beforeEach, describe, expect, it, vi } from "vitest";

/* A fake PostgREST builder: records the filters each query applied and
   resolves to the rows registered for its table. Enough to prove the
   fetchers widen the read to the sibling sections and then pick per key. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];

function builder(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  calls.push({ table, filters });
  const apply = () =>
    (tables[table] ?? []).filter((row) =>
      filters.every(([op, col, val]) =>
        op === "eq"
          ? String(row[col]) === String(val)
          : (val as unknown[]).map(String).includes(String(row[col])),
      ),
    );
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      filters.push(["eq", col, val]);
      return b;
    },
    in: (col: string, val: unknown[]) => {
      filters.push(["in", col, val]);
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

import {
  fetchLearnerYearAttendance,
  fetchLearnerYearGrades,
  fetchLearnerYearRemarks,
  fetchSiblingSectionIds,
  pickPrimaryPerKey,
} from "@/lib/utils/learnerYearRecords";

type R = { section_id: string; k: string; grade?: number };
const byK = (r: R) => r.k;

describe("pickPrimaryPerKey", () => {
  it("keeps one row per key", () => {
    const rows: R[] = [
      { section_id: "5", k: "a" },
      { section_id: "7", k: "b" },
    ];
    expect(pickPrimaryPerKey(rows, byK, "7")).toHaveLength(2);
  });

  it("primary section wins a clash", () => {
    const rows: R[] = [
      { section_id: "5", k: "m:3", grade: 80 },
      { section_id: "7", k: "m:3", grade: 91 },
    ];
    expect(pickPrimaryPerKey(rows, byK, "7")).toEqual([
      { section_id: "7", k: "m:3", grade: 91 },
    ]);
  });

  it("lowest section id wins among non-primary", () => {
    const rows: R[] = [
      { section_id: "12", k: "m:1", grade: 70 },
      { section_id: "9", k: "m:1", grade: 85 },
    ];
    expect(pickPrimaryPerKey(rows, byK, "7").map((r) => r.grade)).toEqual([85]);
  });

  it("numeric not lexical comparison", () => {
    const rows: R[] = [
      { section_id: "10", k: "x" },
      { section_id: "9", k: "x" },
    ];
    expect(pickPrimaryPerKey(rows, byK, "1")[0].section_id).toBe("9");
  });

  it("attendance keyed by date", () => {
    const rows = [
      { section_id: "5", date: "2026-09-01", am_present: false },
      { section_id: "7", date: "2026-09-01", am_present: true },
    ];
    expect(pickPrimaryPerKey(rows, (r) => r.date, "7")).toEqual([
      { section_id: "7", date: "2026-09-01", am_present: true },
    ]);
  });

  it("no rows", () => {
    expect(pickPrimaryPerKey([] as R[], byK, "7")).toEqual([]);
  });
});

describe("year fetchers", () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    calls.length = 0;
  });

  it("sibling sections are same school, school year and grade level", async () => {
    tables.sms_sections = [
      { id: 5, school_id: 1, school_year: "2026-2027", grade_level: 7 },
      { id: 7, school_id: 1, school_year: "2026-2027", grade_level: 7 },
      { id: 8, school_id: 1, school_year: "2026-2027", grade_level: 8 },
      { id: 9, school_id: 2, school_year: "2026-2027", grade_level: 7 },
      { id: 4, school_id: 1, school_year: "2025-2026", grade_level: 7 },
    ];
    const ids = await fetchSiblingSectionIds({
      schoolId: "1",
      schoolYear: "2026-2027",
      gradeLevel: 7,
    });
    expect(ids.sort()).toEqual(["5", "7"]);
  });

  it("grades from an earlier section fill the quarters, current section wins a clash", async () => {
    tables.sms_grades = [
      { student_id: 3, school_year: "2026-2027", section_id: 5, subject_id: 11, grading_period: 1, grade: 80 },
      { student_id: 3, school_year: "2026-2027", section_id: 5, subject_id: 11, grading_period: 2, grade: 82 },
      { student_id: 3, school_year: "2026-2027", section_id: 5, subject_id: 11, grading_period: 3, grade: 70 },
      { student_id: 3, school_year: "2026-2027", section_id: 7, subject_id: 11, grading_period: 3, grade: 90 },
      { student_id: 3, school_year: "2026-2027", section_id: 8, subject_id: 11, grading_period: 4, grade: 60 },
      { student_id: 4, school_year: "2026-2027", section_id: 7, subject_id: 11, grading_period: 4, grade: 99 },
    ];
    const rows = await fetchLearnerYearGrades({
      studentId: "3",
      schoolYear: "2026-2027",
      sectionIds: ["5", "7"],
      primarySectionId: "7",
    });
    const byPeriod = Object.fromEntries(rows.map((r) => [r.grading_period, r.grade]));
    expect(byPeriod).toEqual({ 1: 80, 2: 82, 3: 90 });
    expect(rows.every((r) => typeof r.subject_id === "string")).toBe(true);
  });

  it("attendance from both sections, one row per date", async () => {
    tables.sms_attendance = [
      { student_id: 3, school_year: "2026-2027", section_id: 5, date: "2026-08-03", am_present: false, pm_present: false },
      { student_id: 3, school_year: "2026-2027", section_id: 5, date: "2026-11-03", am_present: false, pm_present: false },
      { student_id: 3, school_year: "2026-2027", section_id: 7, date: "2026-11-03", am_present: true, pm_present: true },
    ];
    const rows = await fetchLearnerYearAttendance({
      studentId: "3",
      schoolYear: "2026-2027",
      sectionIds: ["5", "7"],
      primarySectionId: "7",
    });
    expect(rows.map((r) => [r.date, r.am_present]).sort()).toEqual([
      ["2026-08-03", false],
      ["2026-11-03", true],
    ]);
  });

  it("term remarks fall back to the earlier section", async () => {
    tables.sms_report_card_remarks = [
      { student_id: 3, school_year: "2026-2027", section_id: 5, term: 1, remarks: "from A" },
      { student_id: 3, school_year: "2026-2027", section_id: 5, term: 2, remarks: "old" },
      { student_id: 3, school_year: "2026-2027", section_id: 7, term: 2, remarks: "from B" },
    ];
    const remarks = await fetchLearnerYearRemarks({
      studentId: "3",
      schoolYear: "2026-2027",
      sectionIds: ["5", "7"],
      primarySectionId: "7",
    });
    expect(remarks).toEqual({ 1: "from A", 2: "from B" });
  });
});
