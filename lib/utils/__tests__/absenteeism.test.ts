import { describe, expect, it } from "vitest";
import {
  absenteeismRate,
  AbsenteeismSectionRow,
  buildAbsenteeismReport,
  periodOptions,
  periodRange,
  schoolDetailRows,
  WHOLE_YEAR,
} from "@/lib/utils/absenteeism";

const row = (over: Partial<AbsenteeismSectionRow>): AbsenteeismSectionRow => ({
  school_id: 1,
  school_name: "A School",
  section_id: 1,
  section_name: "Rizal",
  grade_level: 1,
  adviser_name: null,
  class_days: 10,
  enrolled_male: 2,
  enrolled_female: 3,
  absentees_male: 1,
  absentees_female: 1,
  chronic_male: 1,
  chronic_female: 0,
  days_absent_male: 2,
  days_absent_female: 0.5,
  ...over,
});

describe("buildAbsenteeismReport", () => {
  const report = buildAbsenteeismReport([
    row({ section_id: 1 }),
    row({ section_id: 2, section_name: "Bonifacio" }),
    row({ section_id: 3, grade_level: 0 }),
    row({ school_id: 2, school_name: "B School", section_id: 4, class_days: 20 }),
  ]);

  it("sums sections into grades, schools and the division", () => {
    expect(report.total.enrolled).toBe(20);
    expect(report.male.daysAbsent).toBe(8);
    expect(report.female.daysAbsent).toBe(2);
    expect(report.schools.map((s) => s.name)).toEqual(["A School", "B School"]);
    const a = report.schools[0];
    expect(a.grades.map((g) => g.label)).toEqual(["Kindergarten", "Grade 1"]);
    expect(a.grades[1].sections.map((s) => s.name)).toEqual(["Bonifacio", "Rizal"]);
    expect(a.grades[1].total.absentees).toBe(4);
  });

  it("rolls grade levels up across schools", () => {
    const g1 = report.grades.find((g) => g.gradeLevel === 1)!;
    expect(g1.total.enrolled).toBe(15);
  });

  it("weights the rate by each school's own class days", () => {
    // 10 days absent over (15 learners × 10 days) + (5 learners × 20 days)
    expect(absenteeismRate(report.total)).toBeCloseTo((10 / 250) * 100);
  });

  it("puts a grade's sections above its subtotal and ends with the school", () => {
    const rows = schoolDetailRows(report.schools[0], true);
    expect(rows.map((r) => r.kind)).toEqual([
      "row", "subtotal", "row", "row", "subtotal", "total",
    ]);
  });
});

describe("periods", () => {
  it("offers the whole year then June through May", () => {
    const options = periodOptions("2026-2027");
    expect(options[0].value).toBe(WHOLE_YEAR);
    expect(options[1].value).toBe("2026-06");
    expect(options[12].value).toBe("2027-05");
  });

  it("maps a month to its first and last day", () => {
    expect(periodRange("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(periodRange(WHOLE_YEAR)).toEqual({ from: null, to: null });
  });
});
