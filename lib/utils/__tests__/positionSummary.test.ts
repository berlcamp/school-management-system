import { describe, expect, it } from "vitest";
import {
  buildPositionSummary,
  NOT_SPECIFIED,
  positionExportRows,
  positionSchoolRows,
  PositionStaff,
} from "@/lib/utils/positionSummary";

let nextId = 1;
const person = (over: Partial<PositionStaff>): PositionStaff => ({
  id: nextId++,
  name: `Person ${nextId}`,
  gender: "female",
  position: null,
  type: "teacher",
  school_id: 1,
  school_name: "A School",
  ...over,
});

describe("buildPositionSummary", () => {
  it("folds hand-typed teacher positions into the listed one", () => {
    const s = buildPositionSummary([
      person({ position: "Teacher III" }),
      person({ position: "TEACHER III", gender: "male" }),
      person({ position: "Teacher 3" }),
      person({ position: "teacher-iii" }),
    ]);
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0]).toMatchObject({
      label: "Teacher III",
      teaching: true,
      male: 1,
      female: 3,
      total: 4,
    });
  });

  it("keeps a look-alike position its own row", () => {
    const s = buildPositionSummary([
      person({ position: "Head Teacher I" }),
      person({ position: "Teacher I" }),
    ]);
    expect(s.groups.map((g) => g.label)).toEqual(["Teacher I", "Head Teacher I"]);
  });

  it("groups free-typed positions ignoring case and spacing, in the commonest spelling", () => {
    const s = buildPositionSummary([
      person({ position: "Administrative Officer II" }),
      person({ position: "administrative  officer ii" }),
      person({ position: "Administrative Officer II " }),
    ]);
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].label).toBe("Administrative Officer II");
    expect(s.groups[0].total).toBe(3);
  });

  it("orders plantilla teacher positions first, then A–Z, Not specified last", () => {
    const s = buildPositionSummary([
      person({ position: null }),
      person({ position: "Security Guard" }),
      person({ position: "Master Teacher I" }),
      person({ position: "Administrative Aide" }),
      person({ position: "Teacher I" }),
      person({ position: "  " }),
    ]);
    expect(s.groups.map((g) => g.label)).toEqual([
      "Teacher I",
      "Master Teacher I",
      "Administrative Aide",
      "Security Guard",
      NOT_SPECIFIED,
    ]);
    expect(s.groups.at(-1)?.total).toBe(2);
  });

  it("counts sex, with unrecorded kept apart, and totals agree", () => {
    const s = buildPositionSummary([
      person({ position: "Teacher I", gender: "male" }),
      person({ position: "Teacher I", gender: null }),
      person({ position: "Teacher II", gender: "female" }),
    ]);
    expect(s).toMatchObject({ male: 1, female: 1, unrecorded: 1, total: 3 });
    expect(s.groups.reduce((n, g) => n + g.total, 0)).toBe(s.total);
    expect(positionExportRows(s).at(-1)).toMatchObject({
      "Position / Designation": "TOTAL",
      Total: 3,
    });
  });

  it("splits a position per school, summing back to the position row", () => {
    const s = buildPositionSummary([
      person({ position: "Teacher I", school_id: 2, school_name: "B School" }),
      person({ position: "Teacher I", school_id: 1, school_name: "A School" }),
      person({
        position: "Teacher I",
        school_id: 2,
        school_name: "B School",
        gender: "male",
      }),
    ]);
    const rows = positionSchoolRows(s.groups[0]);
    expect(rows.map((r) => [r.schoolName, r.total])).toEqual([
      ["A School", 1],
      ["B School", 2],
    ]);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(s.groups[0].total);
    expect(s.schoolCount).toBe(2);
  });
});
