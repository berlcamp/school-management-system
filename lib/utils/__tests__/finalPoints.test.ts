import { describe, expect, it } from "vitest";
import { adjustmentMap, pointsFor, withPoints } from "../finalPoints";
import { buildCardSubjectRows, computeGeneralAverage } from "../mapeh";
import { mapehTermGrades } from "../mapehTermGrades";

const row = (semester: number, points: number) => ({
  student_id: 1, subject_id: 2, school_year: "2026-2027", semester, points,
});

describe("finalPoints", () => {
  it("adds points to a final, never past 100, never to a blank", () => {
    expect(withPoints(77, 2)).toBe(79);
    expect(withPoints(99, 5)).toBe(100);
    expect(withPoints(null, 5)).toBeNull();
  });

  it("applies a whole-year adjustment in full and only to its own key", () => {
    const m = adjustmentMap([row(0, 2)]);
    expect(pointsFor(m, "1", "2", "2026-2027", [1, 2, 3])).toBe(2);
    expect(pointsFor(m, "1", "2", "2027-2028", [1, 2, 3])).toBe(0);
    expect(pointsFor(m, "1", "3", "2026-2027", [1, 2, 3])).toBe(0);
  });

  it("keeps a semester's points to that semester", () => {
    const m = adjustmentMap([row(1, 4)]);
    expect(pointsFor(m, 1, 2, "2026-2027", [1, 2])).toBe(4);
    expect(pointsFor(m, 1, 2, "2026-2027", [3, 4])).toBe(0);
    expect(pointsFor(m, 1, 2, "2026-2027", [1, 2, 3, 4])).toBe(2);
  });
});

const subject = (name: string, g: number, extra = {}) => ({
  name, is_madrasah: false, q1: g, q2: g, q3: g, q4: null, ...extra,
});

describe("card rows with points", () => {
  it("raises the final and the average, not the terms", () => {
    const rows = buildCardSubjectRows([subject("Science", 77, { finalPoints: 2 })], {
      requirePeriods: 3,
    });
    expect(rows[0]).toMatchObject({ q1: 77, q2: 77, q3: 77, final: 79 });
    expect(computeGeneralAverage(rows).average).toBe(79);
  });

  it("turns a failing final into a pass only through its points", () => {
    const rows = buildCardSubjectRows([subject("Science", 74, { finalPoints: 1 })], {
      requirePeriods: 3,
    });
    expect(rows[0].remarks).toBe("Passed");
  });

  it("stays blank until the year is complete", () => {
    const rows = buildCardSubjectRows(
      [{ ...subject("Science", 77, { finalPoints: 2 }), q3: null }],
      { requirePeriods: 3 },
    );
    expect(rows[0].final).toBeNull();
  });

  it("carries a component's points to MAPEH by its share", () => {
    const out = mapehTermGrades(
      [
        { component: "music_arts", terms: { 1: 80, 2: 80, 3: 80 }, finalPoints: 4 },
        { component: "pe_health", terms: { 1: 90, 2: 90, 3: 90 } },
      ],
      [1, 2, 3],
    );
    expect(out.final).toBe(87);
    expect(out.terms[1]).toBe(85);
  });

  it("weights an EPP/TLE component's points", () => {
    const rows = buildCardSubjectRows(
      [
        subject("ICT", 80, { tle_component: "ict", finalPoints: 4 }),
        subject("AFA", 80, { tle_component: "afa" }),
      ],
      { requirePeriods: 3 },
    );
    expect(rows.find((r) => r.kind === "header")?.final).toBe(81);
  });
});
