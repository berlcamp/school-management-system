import { describe, expect, it } from "vitest";
import {
  ALL_DISTRICTS,
  OTHER_DISTRICT,
  attendancePercent,
  inDistrict,
  normalizeNutritionRow,
  normalizeOverviewRow,
  nutritionDistribution,
  rehabilitationPercent,
  schoolAttendancePercent,
  sumOverview,
  type SbfpNutritionRow,
} from "@/lib/utils/sbfpOverview";

const school = (over: Record<string, unknown>) =>
  normalizeOverviewRow({ school_id: 1, school_name: "A", district: null, program_id: null, ...over });

describe("sumOverview", () => {
  it("sums counts and counts schools by stage", () => {
    const t = sumOverview([
      school({ program_id: 7, beneficiaries: 10, feeding_days: 20, days_present: 180 }),
      school({ program_id: 8, beneficiaries: 0, feeding_days: 0 }),
      school({}),
    ]);
    expect(t.schools).toBe(3);
    expect(t.schoolsWithProgram).toBe(2);
    expect(t.schoolsFeeding).toBe(1);
    expect(t.beneficiaries).toBe(10);
    expect(t.expectedFeedings).toBe(200);
  });

  it("reads bigint-as-string columns from PostgREST as numbers", () => {
    const r = normalizeOverviewRow({ school_id: "3", school_name: "B", beneficiaries: "12" });
    expect(r.beneficiaries).toBe(12);
    expect(r.packs_new).toBe(0);
    expect(r.program_id).toBeNull();
  });
});

describe("rates", () => {
  it("weights attendance by each school's own learners × days, not by school", () => {
    // A: 10 learners × 20 days, 200 present (100%). B: 100 × 20, 1000 present (50%).
    // The mean of the school rates would be 75%; the division is 1200 / 2200.
    const rows = [
      school({ beneficiaries: 10, feeding_days: 20, days_present: 200 }),
      school({ beneficiaries: 100, feeding_days: 20, days_present: 1000 }),
    ];
    expect(attendancePercent(sumOverview(rows))).toBeCloseTo((1200 / 2200) * 100, 6);
    expect(schoolAttendancePercent(rows[0])).toBe(100);
  });

  it("returns null rather than 0% when there is nothing to divide by", () => {
    expect(attendancePercent(sumOverview([school({ beneficiaries: 5 })]))).toBeNull();
    expect(rehabilitationPercent({ rehabilitated: 0, wasted_at_baseline: 0 })).toBeNull();
    expect(rehabilitationPercent({ rehabilitated: 1, wasted_at_baseline: 4 })).toBe(25);
  });
});

describe("districts", () => {
  it("matches the five districts loosely and files the rest under Other", () => {
    expect(inDistrict("Central District", "Central")).toBe(true);
    expect(inDistrict("NORTH", "North")).toBe(true);
    expect(inDistrict("Bayugan III", OTHER_DISTRICT)).toBe(true);
    expect(inDistrict(null, OTHER_DISTRICT)).toBe(true);
    expect(inDistrict("North", "Central")).toBe(false);
    expect(inDistrict("anything", ALL_DISTRICTS)).toBe(true);
  });
});

describe("nutritionDistribution", () => {
  const rows: SbfpNutritionRow[] = [
    { period: "baseline", nutritional_status: "wasted", height_for_age: "normal", learners: 3 },
    { period: "baseline", nutritional_status: "normal", height_for_age: null, learners: 1 },
    { period: "baseline", nutritional_status: null, height_for_age: "stunted", learners: 1 },
    { period: "endline", nutritional_status: "normal", height_for_age: "normal", learners: 4 },
  ].map((r) =>
    normalizeNutritionRow({ school_id: 1, grade_level: 3, sex: "female", ...r }),
  );

  it("keeps the scale's order and leaves a missing band out of the percent", () => {
    const d = nutritionDistribution(rows, "baseline", "bmi");
    expect(d.total).toBe(5);
    expect(d.unrecorded).toBe(1);
    expect(d.bands.map((b) => b.key)).toEqual([
      "severely_wasted",
      "wasted",
      "normal",
      "overweight",
      "obese",
    ]);
    expect(d.bands.find((b) => b.key === "wasted")).toMatchObject({ count: 3, percent: 75 });
  });

  it("reads height-for-age on its own axis", () => {
    const d = nutritionDistribution(rows, "baseline", "hfa");
    expect(d.unrecorded).toBe(1);
    expect(d.bands.find((b) => b.key === "stunted")?.count).toBe(1);
  });

  it("is empty for a period nobody was weighed in", () => {
    const d = nutritionDistribution(rows, "midline", "bmi");
    expect(d.total).toBe(0);
    expect(d.bands.every((b) => b.percent === 0)).toBe(true);
  });
});
