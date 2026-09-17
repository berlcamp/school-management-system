import { describe, expect, it } from "vitest";
import {
  isOldShsCurriculum,
  STRENGTHENED_SHS_START_SY,
  suggestShsCurriculum,
} from "@/lib/constants/shs";
import {
  getGradingPeriodsForSection,
  getGradingPeriodTypeForSection,
  gradingPeriodsOfSemester,
  OLD_SHS_PERIODS,
  semesterOfGradingPeriod,
} from "@/lib/utils/schoolYear";
import {
  suggestGradingScheme,
  suggestOldShsWeightPreset,
  suggestUseTransmutation,
  transmuteGrade,
  matchWeightPreset,
  weightPresetsFor,
} from "@/lib/constants/classRecord";

describe("suggestShsCurriculum", () => {
  it("puts Grade 12 on the old curriculum for the year Grade 11 moves", () => {
    // The strengthened programme reaches Grade 11 in 2026-2027 and Grade 12
    // only the year after — the cohort this whole change exists for.
    expect(suggestShsCurriculum(11, "2026-2027")).toBe("strengthened");
    expect(suggestShsCurriculum(12, "2026-2027")).toBe("old");
    expect(suggestShsCurriculum(12, "2027-2028")).toBe("strengthened");
  });

  it("puts both SHS grades on the old curriculum before the rollout", () => {
    expect(suggestShsCurriculum(11, "2025-2026")).toBe("old");
    expect(suggestShsCurriculum(12, "2025-2026")).toBe("old");
  });

  it("says nothing about a grade level that is not Senior High", () => {
    expect(suggestShsCurriculum(10, "2026-2027")).toBeNull();
    expect(suggestShsCurriculum(0, "2026-2027")).toBeNull();
    expect(suggestShsCurriculum(null, "2026-2027")).toBeNull();
  });

  it("agrees with the rollout table it suggests from", () => {
    expect(STRENGTHENED_SHS_START_SY[11]).toBe("2026-2027");
    expect(STRENGTHENED_SHS_START_SY[12]).toBe("2027-2028");
  });
});

describe("isOldShsCurriculum", () => {
  it("is true only for a section actually tagged old — never inferred", () => {
    expect(isOldShsCurriculum("old")).toBe(true);
    expect(isOldShsCurriculum("strengthened")).toBe(false);
    // An untagged section keeps the behaviour it has today.
    expect(isOldShsCurriculum(null)).toBe(false);
    expect(isOldShsCurriculum(undefined)).toBe(false);
  });
});

describe("grading periods per section", () => {
  it("gives an old-curriculum section four semestral quarters in a term year", () => {
    const periods = getGradingPeriodsForSection("2026-2027", "old");
    expect(periods).toHaveLength(4);
    expect(periods.map((p) => p.value)).toEqual([1, 2, 3, 4]);
    expect(periods[2].label).toContain("2nd Sem");
    expect(getGradingPeriodTypeForSection("2026-2027", "old")).toBe("quarter");
  });

  it("leaves every other section on the school year's own periods", () => {
    expect(getGradingPeriodsForSection("2026-2027", "strengthened")).toHaveLength(3);
    expect(getGradingPeriodsForSection("2026-2027", null)).toHaveLength(3);
    expect(getGradingPeriodsForSection("2025-2026", null)).toHaveLength(4);
  });

  it("splits the periods into semesters the way SF10 already reads them", () => {
    expect(gradingPeriodsOfSemester(1)).toEqual([1, 2]);
    expect(gradingPeriodsOfSemester(2)).toEqual([3, 4]);
    expect(semesterOfGradingPeriod(1)).toBe(1);
    expect(semesterOfGradingPeriod(2)).toBe(1);
    expect(semesterOfGradingPeriod(3)).toBe(2);
    expect(semesterOfGradingPeriod(4)).toBe(2);
  });

  it("numbers the quarters from 1 within each semester", () => {
    // The issued SHS forms restart the numbering, so the short labels have to
    // say which semester they belong to rather than running Q1..Q4.
    expect(OLD_SHS_PERIODS.map((p) => p.short)).toEqual([
      "S1Q1",
      "S1Q2",
      "S2Q1",
      "S2Q2",
    ]);
  });
});

describe("class record defaults for an old-curriculum section", () => {
  it("opens on DO 8, s.2015 and transmutes", () => {
    expect(suggestGradingScheme("old")).toBe("legacy");
    expect(suggestUseTransmutation("old")).toBe(true);
  });

  it("leaves every other section on the column default", () => {
    expect(suggestGradingScheme(null)).toBe("matatag");
    expect(suggestGradingScheme("strengthened")).toBe("matatag");
    expect(suggestUseTransmutation(null)).toBe(false);
  });

  it("offers the SHS weight splits, and only those", () => {
    const presets = weightPresetsFor("old");
    expect(presets.map((p) => p.id)).toEqual([
      "shs_core",
      "shs_academic",
      "shs_tvl",
    ]);
    expect(weightPresetsFor(null).map((p) => p.id)).toEqual([
      "core",
      "tle",
      "mapeh",
    ]);
  });

  it("suggests the split from the subject's category and the section's track", () => {
    expect(suggestOldShsWeightPreset({ shsCategory: "core" })).toMatchObject({
      ww: 25,
      pt: 50,
      st: 25,
    });
    expect(
      suggestOldShsWeightPreset({ shsCategory: "elective", track: "academic" }),
    ).toMatchObject({ ww: 25, pt: 45, st: 30 });
    expect(
      suggestOldShsWeightPreset({ shsCategory: "elective", track: "tvl" }),
    ).toMatchObject({ ww: 20, pt: 60, st: 20 });
  });

  it("reads an SHS split back as its preset rather than as custom weights", () => {
    expect(matchWeightPreset(25, 45, 30)?.id).toBe("shs_academic");
  });
});

describe("the two transmutation tables", () => {
  it("are not interchangeable in the range real grades land in", () => {
    // Why migration 190 exists: the same Initial Grade is worth several marks
    // less under the updated table than under the one this cohort is graded on.
    const cases: [number, number, number][] = [
      // [initial grade, DO 8 s.2015, MATATAG]
      [90, 93, 91],
      [85, 90, 87],
      [80, 87, 83],
      [75, 84, 79],
      [70, 81, 75],
      [65, 78, 73],
    ];
    cases.forEach(([initial, legacy, matatag]) => {
      expect(transmuteGrade(initial, "legacy")).toBe(legacy);
      expect(transmuteGrade(initial, "matatag")).toBe(matatag);
    });
  });
});
